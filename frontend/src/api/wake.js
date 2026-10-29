// 后端唤醒检测
//
// Render 免费实例 15 分钟没有请求就会休眠，之后的第一个请求要等 30~60 秒冷启动。
// 所有发往后端的请求在真正发出前都先 await wakeBackend()：后端醒着时立即返回（不额外发请求），
// 疑似休眠时先轮询 /api/health 等它起来，期间 WakeBanner 显示"服务正在唤醒"，
// 避免用户把冷启动的长时间等待误当成"登录失败"或"网络错误"。
import { resolveApiUrl } from './config'

const WAKE_TIMEOUT_MS = 60000 // 最多等 60 秒
const PING_TIMEOUT_MS = 10000 // 单次 ping 的超时
const PING_INTERVAL_MS = 2000 // ping 失败后隔多久再试
// 距离上一次收到后端响应超过 10 分钟，就认为后端可能又休眠了（Render 是 15 分钟），下次请求前重新确认
const STALE_AFTER_MS = 10 * 60 * 1000
// 网关类状态码说明请求没到达后端进程（实例还在启动）；其他任何响应都说明进程已经在运行
const GATEWAY_STATUS = new Set([502, 503, 504])

let status = 'idle' // idle | waking | ready | failed
let lastAliveAt = 0
let pending = null
const listeners = new Set()

function setStatus(next) {
  if (status === next) return
  status = next
  listeners.forEach((listener) => listener(next))
}

/** 当前唤醒状态：idle 未检测 / waking 唤醒中 / ready 已就绪 / failed 等了 60 秒仍没响应 */
export function getWakeStatus() {
  return status
}

/** 订阅唤醒状态变化，返回取消订阅函数 */
export function subscribeWakeStatus(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** 收到后端的任何响应时调用，刷新"后端醒着"的时间戳 */
export function markBackendAlive() {
  lastAliveAt = Date.now()
  setStatus('ready')
}

async function pingOnce(timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    // 旧版后端没有 /api/health 会返回 404，同样说明进程在运行，也算唤醒成功
    const response = await fetch(resolveApiUrl('/api/health'), { signal: controller.signal, cache: 'no-store' })
    return !GATEWAY_STATUS.has(response.status)
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 确保后端已唤醒
 * - 最近 10 分钟内收到过后端响应：立即返回 true
 * - 否则轮询 /api/health，最多等 60 秒；多个请求同时调用时共用同一次检测
 * - 60 秒仍没有响应返回 false（调用方照常发请求，让真实错误自然暴露）
 * @returns {Promise<boolean>} 后端是否已就绪
 */
export function wakeBackend() {
  if (status === 'ready' && Date.now() - lastAliveAt < STALE_AFTER_MS) {
    return Promise.resolve(true)
  }
  if (pending) return pending

  setStatus('waking')
  pending = (async () => {
    const deadline = Date.now() + WAKE_TIMEOUT_MS
    while (Date.now() < deadline) {
      if (await pingOnce(Math.min(PING_TIMEOUT_MS, deadline - Date.now()))) {
        markBackendAlive()
        return true
      }
      const remaining = deadline - Date.now()
      if (remaining > 0) {
        await new Promise((resolve) => setTimeout(resolve, Math.min(PING_INTERVAL_MS, remaining)))
      }
    }
    setStatus('failed')
    return false
  })().finally(() => {
    pending = null
  })
  return pending
}
