// 聊天历史相关的 API 封装
import { authFetch, extractErrorMessage } from './http'

/**
 * 获取当前登录用户与指定角色的聊天历史（按时间正序）
 * 会话不存在时后端会自动新建并插入角色开场白
 * @param {number} characterId 角色 ID
 * @returns {Promise<{conversation_id: number, messages: Array}>} 会话 ID + 历史消息数组
 */
export async function getChatHistory(characterId) {
  const response = await authFetch(`/api/chat/history?character_id=${characterId}`)
  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, '获取聊天历史失败'))
  }
  return response.json()
}

/**
 * 重新生成指定会话最后一条 AI 回复
 * 后端会删除原有的最后一条 assistant 消息并重新生成，不会新增 user 消息
 * @param {number} conversationId 会话 ID
 * @param {boolean} allowEmoji 是否允许 AI 回复中包含表情符号
 * @returns {Promise<{reply: string, character_id: number, conversation_id: number}>}
 */
export async function regenerateReply(conversationId, allowEmoji = true) {
  const response = await authFetch('/api/chat/regenerate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conversation_id: conversationId, allow_emoji: allowEmoji }),
  })
  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, '重新生成回复失败'))
  }
  return response.json()
}

/**
 * 清空指定会话的聊天历史（后端真正删除消息记录，不只是清空前端显示）
 * @param {number} conversationId 会话 ID
 * @returns {Promise<{deleted: number}>}
 */
export async function clearChatHistory(conversationId) {
  const response = await authFetch(`/api/chat/history?conversation_id=${conversationId}`, {
    method: 'DELETE',
  })
  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, '清空聊天历史失败'))
  }
  return response.json()
}
