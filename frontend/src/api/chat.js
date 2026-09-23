// 聊天历史相关的 API 封装
import { authFetch, extractErrorMessage } from './http'

/**
 * 获取当前登录用户与指定角色的聊天历史（按时间正序）
 * 会话不存在时后端会自动新建并插入角色开场白
 * @param {number} characterId 角色 ID
 * @returns {Promise<Array>} 历史消息数组
 */
export async function getChatHistory(characterId) {
  const response = await authFetch(`/api/chat/history?character_id=${characterId}`)
  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, '获取聊天历史失败'))
  }
  return response.json()
}
