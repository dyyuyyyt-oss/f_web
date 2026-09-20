// 管理后台相关的 API 封装
import { authFetch, extractErrorMessage } from './http'

/**
 * 获取所有账号列表
 * @returns {Promise<Array>} 账号数组
 */
export async function getUsers() {
  const response = await authFetch('/api/admin/users')
  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, '获取账号列表失败'))
  }
  return response.json()
}

/**
 * 管理员手动新增账号
 * @param {{username: string, password: string, role?: string}} data
 * @returns {Promise<Object>} 新建的账号
 */
export async function createUser(data) {
  const response = await authFetch('/api/admin/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, '创建账号失败'))
  }
  return response.json()
}

/**
 * 编辑账号（用户名和/或密码，只传要改的字段）
 * @param {number} id 账号 ID
 * @param {{username?: string, password?: string}} data
 * @returns {Promise<Object>} 更新后的账号
 */
export async function updateUser(id, data) {
  const response = await authFetch(`/api/admin/users/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, '更新账号失败'))
  }
  return response.json()
}

/**
 * 删除账号
 * @param {number} id 账号 ID
 */
export async function deleteUser(id) {
  const response = await authFetch(`/api/admin/users/${id}`, { method: 'DELETE' })
  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, '删除账号失败'))
  }
  return response.json()
}

/**
 * 获取待审核的注册申请列表
 * @returns {Promise<Array>} 待审核申请数组
 */
export async function getPendingRequests() {
  const response = await authFetch('/api/admin/registration-requests')
  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, '获取待审核列表失败'))
  }
  return response.json()
}

/**
 * 同意注册申请
 * @param {number} id 申请 ID
 * @returns {Promise<Object>} 新建的账号
 */
export async function approveRequest(id) {
  const response = await authFetch(`/api/admin/registration-requests/${id}/approve`, {
    method: 'POST',
  })
  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, '批准申请失败'))
  }
  return response.json()
}

/**
 * 拒绝注册申请
 * @param {number} id 申请 ID
 */
export async function rejectRequest(id) {
  const response = await authFetch(`/api/admin/registration-requests/${id}/reject`, {
    method: 'POST',
  })
  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, '拒绝申请失败'))
  }
  return response.json()
}
