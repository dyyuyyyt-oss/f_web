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

/**
 * 带登录态的 fetch 封装：自动附带 Authorization 头
 * 收到 401（登录已失效）时清空本地登录态并跳转登录页
 */
export async function authFetch(path, options = {}) {
  const token = getToken()
  const headers = { ...(options.headers || {}) }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const response = await fetch(resolveApiUrl(path), { ...options, headers })

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
