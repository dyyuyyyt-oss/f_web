// 聊天页用到的纯函数：时间解析与格式化、导出 Markdown

/**
 * 解析后端返回的时间
 * 后端用 datetime.utcnow() 存时间，序列化出来不带时区（如 2026-10-29T02:47:53.123456），
 * 直接 new Date() 会被当成本地时间，在东八区会差 8 小时，所以没有时区的一律按 UTC 解析
 */
export function parseServerTime(value) {
  if (!value) return null
  const hasZone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(value)
  const date = new Date(hasZone ? value : `${value}Z`)
  return Number.isNaN(date.getTime()) ? null : date
}

const pad = (n) => String(n).padStart(2, '0')

/** 消息时间：今天只显示 时:分，其他日期显示 月-日 时:分 */
export function formatMessageTime(value, now = new Date()) {
  const date = parseServerTime(value)
  if (!date) return ''
  const clock = `${pad(date.getHours())}:${pad(date.getMinutes())}`
  return date.toDateString() === now.toDateString() ? clock : `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${clock}`
}

/** 秒数，保留 1 位小数 */
export function formatSeconds(ms) {
  return `${(ms / 1000).toFixed(1)}s`
}

/**
 * 把当前对话整理成 Markdown 文本
 * @param {{ characterName: string, messages: Array<{role, content, image_url?, created_at?}>, exportedAt?: Date }} options
 */
export function buildChatMarkdown({ characterName, messages, exportedAt = new Date() }) {
  const stamp = `${exportedAt.getFullYear()}-${pad(exportedAt.getMonth() + 1)}-${pad(exportedAt.getDate())} ${pad(exportedAt.getHours())}:${pad(exportedAt.getMinutes())}`
  const lines = [`# 与${characterName}的对话`, '', `> 导出时间：${stamp}`, '']
  for (const message of messages) {
    const name = message.role === 'user' ? '你' : characterName
    const time = formatMessageTime(message.created_at, exportedAt)
    lines.push(`**${name}**${time ? ` · ${time}` : ''}`, '')
    if (message.image_url) lines.push(`![图片](${message.image_url})`, '')
    if (message.content) lines.push(message.content, '')
  }
  return lines.join('\n')
}

/** 导出文件名：角色名-年月日-时分.md */
export function chatExportFileName(characterName, at = new Date()) {
  const safeName = String(characterName).replace(/[\\/:*?"<>|]/g, '_')
  return `${safeName}-${at.getFullYear()}${pad(at.getMonth() + 1)}${pad(at.getDate())}-${pad(at.getHours())}${pad(at.getMinutes())}.md`
}

/** 在浏览器里把文本存成文件 */
export function downloadTextFile(fileName, text, type = 'text/markdown;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  // 立即回收会让部分浏览器在开始下载前就丢失文件（文件名变成 download），留足时间再回收
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}
