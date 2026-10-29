// 登录态存取 + 带登录态的请求封装，供其他 api 模块统一使用
import { resolveApiUrl } from './config'

const TOKEN_KEY = 'confur_auth_token'
const USER_KEY = 'confur_auth_user'

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function getStoredUser() {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function setAuth(token, user) {
  try {
    localStorage.setItem(TOKEN_KEY, token)
    localStorage.setItem(USER_KEY, JSON.stringify(user))
  } catch {
    // 隐私模式等场景下 localStorage 可能不可用，忽略即可
  }
}

export function clearAuth() {
  try {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
  } catch {
    // 忽略
  }
}

// ==================== 请求超时与重试 ====================

// 幂等请求（GET/HEAD）的超时：15 秒内收不到响应头就算超时
export const DEFAULT_TIMEOUT_MS = 15000
// 非幂等请求（POST/PUT/PATCH/DELETE）要等后端处理完才返回响应头，
// 比如重新生成回复要等 AI 写完、上传图片要等传完，所以给足时间，只防止无限挂起
const SLOW_TIMEOUT_MS = 120000
// 重试间隔，数组长度就是最多重试次数（2 次）
const RETRY_DELAYS_MS = [1000, 2000]
// 网关类错误：Render 实例冷启动、重启期间常见，值得重试
const RETRYABLE_STATUS = new Set([502, 503, 504])

export const NETWORK_ERROR_MESSAGES = {
  timeout: '网络超时，请检查网络后重试',
  network: '无法连接服务器，请检查网络或稍后再试',
}

/**
 * 请求失败时抛出的错误，kind 用来区分失败原因，页面据此给出不同提示：
 * - timeout：超时没有收到响应
 * - network：请求没到达后端（断网、DNS、CORS、后端没起来等）
 * - http：后端返回了错误状态码，status 为状态码
 */
export class RequestError extends Error {
  constructor(kind, message, status = null) {
    super(message)
    this.name = 'RequestError'
    this.kind = kind
    this.status = status
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * 带超时和重试的 fetch
 * - 超时只计算到收到响应头为止，之后读取 body（包括流式响应）不受影响
 * - 网络错误、超时、502/503/504 时按 RETRY_DELAYS_MS 重试 retries 次
 * - 调用方传入的 signal 被中止时原样抛出 AbortError，不重试
 * - 最终仍失败则抛出 RequestError（kind 为 timeout 或 network）
 */
export async function fetchWithRetry(url, options = {}, { timeoutMs = DEFAULT_TIMEOUT_MS, retries = 0 } = {}) {
  const callerSignal = options.signal
  let lastError = null

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      await sleep(RETRY_DELAYS_MS[Math.min(attempt - 1, RETRY_DELAYS_MS.length - 1)])
    }

    const controller = new AbortController()
    if (callerSignal) {
      if (callerSignal.aborted) controller.abort()
      else callerSignal.addEventListener('abort', () => controller.abort(), { once: true })
    }
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, timeoutMs)

    try {
      const response = await fetch(url, { ...options, signal: controller.signal })
      if (RETRYABLE_STATUS.has(response.status) && attempt < retries) {
        continue
      }
      return response
    } catch (err) {
      if (callerSignal?.aborted) throw err
      lastError = timedOut
        ? new RequestError('timeout', NETWORK_ERROR_MESSAGES.timeout)
        : new RequestError('network', NETWORK_ERROR_MESSAGES.network)
    } finally {
      clearTimeout(timer)
    }
  }

  throw lastError
}

/**
 * 带登录态的 fetch 封装：自动附带 Authorization 头，并带超时和重试
 * - GET/HEAD 默认 15 秒超时、失败自动重试 2 次
 * - 其他方法默认 120 秒超时、不重试（重试可能导致重复提交）
 * - 第三个参数可以覆盖默认值：{ timeoutMs, retries }
 * 收到 401（登录已失效）时清空本地登录态并跳转登录页
 */
export async function authFetch(path, options = {}, { timeoutMs, retries } = {}) {
  const token = getToken()
  const headers = { ...(options.headers || {}) }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const method = (options.method || 'GET').toUpperCase()
  const idempotent = method === 'GET' || method === 'HEAD'

  const response = await fetchWithRetry(
    resolveApiUrl(path),
    { ...options, headers },
    {
      timeoutMs: timeoutMs ?? (idempotent ? DEFAULT_TIMEOUT_MS : SLOW_TIMEOUT_MS),
      retries: retries ?? (idempotent ? RETRY_DELAYS_MS.length : 0),
    }
  )

  if (response.status === 401 && window.location.pathname !== '/login') {
    clearAuth()
    window.location.href = '/login'
  }

  return response
}

/**
 * 从失败响应中提取错误信息
 * FastAPI 422 校验错误的 detail 是一个数组，其他错误的 detail 是字符串
 */
export async function extractErrorMessage(response, fallback) {
  const errorBody = await response.json().catch(() => null)
  if (!errorBody?.detail) return fallback
  return Array.isArray(errorBody.detail)
    ? errorBody.detail.map((item) => item.msg).join('; ')
    : errorBody.detail
}
