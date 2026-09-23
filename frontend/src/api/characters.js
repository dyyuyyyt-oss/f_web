// 角色相关的 API 封装
// 所有请求都需要登录，统一走 authFetch 自动附带登录令牌
import { authFetch, extractErrorMessage } from './http'

/**
 * 获取角色列表
 * @returns {Promise<Array>} 角色数组
 */
export async function getCharacters() {
  const response = await authFetch('/api/characters')
  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, '获取角色列表失败'))
  }
  return response.json()
}

/**
 * 获取单个角色详情
 * @param {number} id 角色 ID
 * @returns {Promise<Object>} 角色详情
 */
export async function getCharacter(id) {
  const response = await authFetch(`/api/characters/${id}`)
  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, '获取角色详情失败'))
  }
  return response.json()
}

/**
 * 创建角色
 * @param {Object} data 角色信息，包含 name、avatar、persona、greeting、scenario、example_dialogue
 * @returns {Promise<Object>} 新建的角色
 */
export async function createCharacter(data) {
  const response = await authFetch('/api/characters', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, '创建角色失败'))
  }

  return response.json()
}

/**
 * 上传角色头像图片文件
 * @param {File} file 本地图片文件
 * @returns {Promise<{url: string}>} 上传后的图片访问 URL
 */
export async function uploadAvatar(file) {
  const formData = new FormData()
  formData.append('file', file)

  const response = await authFetch('/api/characters/avatar', {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, '上传头像失败'))
  }

  return response.json()
}

/**
 * 更新指定角色的头像
 * @param {number} id 角色 ID
 * @param {string} avatarUrl 新的头像图片 URL
 * @returns {Promise<Object>} 更新后的角色信息
 */
export async function updateCharacterAvatar(id, avatarUrl) {
  const response = await authFetch(`/api/characters/${id}/avatar`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ avatar: avatarUrl }),
  })

  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, '更新头像失败'))
  }

  return response.json()
}

/**
 * 编辑角色：只需传入要修改的字段，未传的字段后端会保持原值不变
 * @param {number} id 角色 ID
 * @param {Object} data 要更新的字段（name/avatar/persona/greeting/scenario/example_dialogue/speaking_style/catchphrase）
 * @returns {Promise<Object>} 更新后的角色完整信息
 */
export async function updateCharacter(id, data) {
  const response = await authFetch(`/api/characters/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, '编辑角色失败'))
  }

  return response.json()
}

/**
 * 删除角色（后端会级联删除该角色下所有会话和消息，不可恢复）
 * @param {number} id 角色 ID
 * @returns {Promise<{deleted: boolean}>}
 */
export async function deleteCharacter(id) {
  const response = await authFetch(`/api/characters/${id}`, {
    method: 'DELETE',
  })

  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, '删除角色失败'))
  }

  return response.json()
}
