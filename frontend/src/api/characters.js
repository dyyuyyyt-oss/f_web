// 角色相关的 API 封装
// 本地开发时走 vite.config.js 中的代理转发到后端；生产环境经 resolveApiUrl 指向真实后端地址
import { resolveApiUrl } from './config'

// 从失败响应中提取错误信息
// FastAPI 422 校验错误的 detail 是一个数组，其他错误的 detail 是字符串
async function extractErrorMessage(response, fallback) {
  const errorBody = await response.json().catch(() => null)
  if (!errorBody?.detail) return fallback
  return Array.isArray(errorBody.detail)
    ? errorBody.detail.map((item) => item.msg).join('; ')
    : errorBody.detail
}

/**
 * 获取角色列表
 * @returns {Promise<Array>} 角色数组
 */
export async function getCharacters() {
  const response = await fetch(resolveApiUrl('/api/characters'))
  if (!response.ok) {
    throw new Error('获取角色列表失败')
  }
  return response.json()
}

/**
 * 获取单个角色详情
 * @param {number} id 角色 ID
 * @returns {Promise<Object>} 角色详情
 */
export async function getCharacter(id) {
  const response = await fetch(resolveApiUrl(`/api/characters/${id}`))
  if (!response.ok) {
    throw new Error('获取角色详情失败')
  }
  return response.json()
}

/**
 * 创建角色
 * @param {Object} data 角色信息，包含 name、avatar、persona、greeting、scenario、example_dialogue
 * @returns {Promise<Object>} 新建的角色
 */
export async function createCharacter(data) {
  const response = await fetch(resolveApiUrl('/api/characters'), {
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

  const response = await fetch(resolveApiUrl('/api/characters/avatar'), {
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
  const response = await fetch(resolveApiUrl(`/api/characters/${id}/avatar`), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ avatar: avatarUrl }),
  })

  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, '更新头像失败'))
  }

  return response.json()
}
