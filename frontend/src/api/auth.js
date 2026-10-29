// 认证相关的 API 封装
import { resolveApiUrl } from './config'
import {
  authFetch,
  extractErrorMessage,
  fetchWithRetry,
  setAuth,
  RequestError,
  DEFAULT_TIMEOUT_MS,
} from './http'

/**
 * 把登录接口的失败响应转成给用户看的提示
 * - 401 用户名或密码错误、422 参数校验、503 数据库暂时不可用：直接用后端返回的 detail
 * - 其他 5xx：后端抛了未预期的异常，统一提示"服务器出错"，和"密码错误"明确区分开
 */
async function loginErrorMessage(response) {
  const detail = await extractErrorMessage(response, '')
  if (response.status >= 500 && response.status !== 503) {
    return `服务器出错了，请稍后再试（HTTP ${response.status}）`
  }
  return detail || `登录失败（HTTP ${response.status}）`
}

/**
 * 登录
 * 超时或网络错误时自动重试 2 次；最终失败抛出 RequestError：
 * kind 为 timeout / network 表示没连上服务器，kind 为 http 表示服务器返回了错误
 * @param {string} username 用户名
 * @param {string} password 密码
 * @returns {Promise<Object>} 当前登录用户信息
 */
export async function login(username, password) {
  const response = await fetchWithRetry(
    resolveApiUrl('/api/auth/login'),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    },
    { timeoutMs: DEFAULT_TIMEOUT_MS, retries: 2 }
  )

  if (!response.ok) {
    throw new RequestError('http', await loginErrorMessage(response), response.status)
  }

  const data = await response.json()
  setAuth(data.access_token, data.user)
  return data.user
}

/**
 * 提交注册申请
 * 不自动重试：重复提交会得到"已提交过申请"，反而让人困惑
 * @param {string} username 意向用户名
 * @param {string} password 意向密码
 * @returns {Promise<Object>} 提交成功的提示信息
 */
export async function register(username, password) {
  const response = await fetchWithRetry(
    resolveApiUrl('/api/auth/register'),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    },
    { timeoutMs: DEFAULT_TIMEOUT_MS, retries: 0 }
  )

  if (!response.ok) {
    throw new RequestError('http', await extractErrorMessage(response, '提交申请失败'), response.status)
  }

  return response.json()
}

/**
 * 获取当前登录用户信息（用于刷新页面后恢复登录态）
 * 失败时抛出 RequestError：status 为 401 才表示登录真的失效了，
 * 其他情况（超时、网络错误、5xx）只是暂时连不上，调用方不应据此登出
 * @returns {Promise<Object>} 当前用户信息
 */
export async function getCurrentUser() {
  const response = await authFetch('/api/auth/me')
  if (!response.ok) {
    throw new RequestError('http', '登录已失效', response.status)
  }
  return response.json()
}
