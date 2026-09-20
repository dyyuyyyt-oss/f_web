// 认证相关的 API 封装
import { resolveApiUrl } from './config'
import { authFetch, extractErrorMessage, setAuth } from './http'

/**
 * 登录
 * @param {string} username 用户名
 * @param {string} password 密码
 * @returns {Promise<Object>} 当前登录用户信息
 */
export async function login(username, password) {
  const response = await fetch(resolveApiUrl('/api/auth/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })

  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, '用户名或密码错误'))
  }

  const data = await response.json()
  setAuth(data.access_token, data.user)
  return data.user
}

/**
 * 提交注册申请
 * @param {string} username 意向用户名
 * @param {string} password 意向密码
 * @returns {Promise<Object>} 提交成功的提示信息
 */
export async function register(username, password) {
  const response = await fetch(resolveApiUrl('/api/auth/register'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })

  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, '提交申请失败'))
  }

  return response.json()
}

/**
 * 获取当前登录用户信息（用于刷新页面后恢复登录态）
 * @returns {Promise<Object>} 当前用户信息
 */
export async function getCurrentUser() {
  const response = await authFetch('/api/auth/me')
  if (!response.ok) {
    throw new Error('登录已失效')
  }
  return response.json()
}
