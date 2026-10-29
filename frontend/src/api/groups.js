// 群聊相关的 API 封装（所有请求都需要登录，统一走 authFetch）
import { authFetch, extractErrorMessage } from './http'

async function json(response, fallback) {
  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, fallback))
  }
  return response.json()
}

/** 群聊限制：{ min_members, max_members, max_speakers } */
export async function getGroupConfig() {
  return json(await authFetch('/api/groups/config'), '获取群聊配置失败')
}

/** 当前用户的群列表（含成员，按发言顺序） */
export async function listGroups() {
  return json(await authFetch('/api/groups'), '获取群列表失败')
}

/**
 * 建群
 * @param {string} name 群名
 * @param {number[]} characterIds 成员角色 ID，顺序就是发言顺序
 */
export async function createGroup(name, characterIds) {
  return json(
    await authFetch('/api/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, character_ids: characterIds }),
    }),
    '建群失败'
  )
}

/** 修改群：改名，和 / 或 整体替换成员与顺序（只传要改的字段） */
export async function updateGroup(groupId, { name, characterIds } = {}) {
  const body = {}
  if (name !== undefined) body.name = name
  if (characterIds !== undefined) body.character_ids = characterIds
  return json(
    await authFetch(`/api/groups/${groupId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    '修改群失败'
  )
}

/** 解散群（聊天记录一并删除） */
export async function deleteGroup(groupId) {
  return json(await authFetch(`/api/groups/${groupId}`, { method: 'DELETE' }), '解散群失败')
}

/** 群聊历史：{ conversation_id, messages: [{ id, role, content, created_at, speaker }] } */
export async function getGroupMessages(groupId) {
  return json(await authFetch(`/api/groups/${groupId}/messages`), '获取群聊记录失败')
}

/** 清空群聊历史 */
export async function clearGroupMessages(groupId) {
  return json(await authFetch(`/api/groups/${groupId}/clear`, { method: 'POST' }), '清空群聊失败')
}

/**
 * 群聊发言（SSE 接口）
 * 返回的是请求描述：流式响应由 GroupChat 里的 SSE 消费逻辑处理（逐个角色追加内容、停止、出错提示）
 * @returns {{ path: string, method: string, body: string }}
 */
export function groupChatRequest(groupId, { message, conversationId = null, allowEmoji = true, maxSpeakers = null }) {
  const body = { message, allow_emoji: allowEmoji }
  if (conversationId) body.conversation_id = conversationId
  if (maxSpeakers) body.max_speakers = maxSpeakers
  return { path: `/api/groups/${groupId}/chat`, method: 'POST', body: JSON.stringify(body) }
}
