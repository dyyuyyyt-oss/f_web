// AI BOX 的所有接口。路径都写全 /api/...，authFetch 只负责拼 base。
import { authFetch, extractErrorMessage } from './http'

async function jsonOrThrow(res, fallback) {
  if (!res.ok) throw new Error(await extractErrorMessage(res, fallback))
  return res.json()
}

export async function listRoles() {
  const res = await authFetch('/api/aibox/roles')
  const data = await jsonOrThrow(res, '加载角色失败')
  return data.roles || []
}

export async function getRole(id) {
  const res = await authFetch(`/api/aibox/roles/${id}`)
  return jsonOrThrow(res, '加载角色失败')
}

export async function createRole(payload) {
  const res = await authFetch('/api/aibox/roles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return jsonOrThrow(res, '创建失败')
}

export async function patchRole(id, payload) {
  const res = await authFetch(`/api/aibox/roles/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return jsonOrThrow(res, '保存失败')
}

export async function deleteRole(id) {
  const res = await authFetch(`/api/aibox/roles/${id}`, { method: 'DELETE' })
  return jsonOrThrow(res, '删除失败')
}

export async function bulkDelete(ids) {
  const res = await authFetch('/api/aibox/roles/bulk-delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  })
  return jsonOrThrow(res, '批量删除失败')
}

export async function previewPrompt(id) {
  const res = await authFetch(`/api/aibox/roles/${id}/prompt`)
  const data = await jsonOrThrow(res, '生成提示词失败')
  return data.prompt || ''
}

export async function listVoices() {
  const res = await authFetch('/api/aibox/voices')
  const data = await jsonOrThrow(res, '加载音色失败')
  return data.voices || []
}

export async function uploadVoice(file) {
  const form = new FormData()
  form.append('file', file)
  // 不要手动设 Content-Type，交给浏览器带 boundary
  const res = await authFetch('/api/aibox/voices/upload', { method: 'POST', body: form }, { timeoutMs: 120000 })
  return jsonOrThrow(res, '上传失败')
}

export async function deleteVoice(vid) {
  const res = await authFetch(`/api/aibox/voices/${vid}`, { method: 'DELETE' })
  return jsonOrThrow(res, '删除声线失败')
}

export async function ttsBlob({ text, voiceId, rate, pitch }) {
  const res = await authFetch('/api/aibox/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voice_id: voiceId, rate, pitch }),
  }, { timeoutMs: 60000 })
  if (!res.ok) throw new Error('试听失败')
  return res.blob()
}

export async function getMemory(id) {
  const res = await authFetch(`/api/aibox/roles/${id}/memory`)
  return jsonOrThrow(res, '加载记忆失败')
}

export async function addMemory(id, payload) {
  const res = await authFetch(`/api/aibox/roles/${id}/memory`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return jsonOrThrow(res, '记录失败')
}
export async function deployRole(id, deviceId = 'box-01') {
  const res = await authFetch(`/api/aibox/roles/${id}/deploy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_id: deviceId }),
  })
  return jsonOrThrow(res, '部署失败')
}

export async function getDevice(deviceId = 'box-01') {
  const res = await authFetch(`/api/aibox/device?device_id=${deviceId}`)
  return jsonOrThrow(res, '读取硬件状态失败')
}
export async function postChat(roleId, text, deviceId = 'box-01') {
  const res = await authFetch(`/api/aibox/roles/${roleId}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, device_id: deviceId }),
  })
  return jsonOrThrow(res, '发送失败')
}

export async function getChat(taskId) {
  const res = await authFetch(`/api/aibox/chat/${taskId}`)
  return jsonOrThrow(res, '读取回复失败')
}

export async function chatHistory(roleId) {
  const res = await authFetch(`/api/aibox/roles/${roleId}/chat/history`)
  const data = await jsonOrThrow(res, '加载对话失败')
  return data.messages || []
}
