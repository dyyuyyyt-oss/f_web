import { useEffect, useState } from 'react'
import { getWakeStatus, subscribeWakeStatus, wakeBackend } from '../api/wake'

// 后端已经醒着时 ping 通常几百毫秒就返回，这段时间内不显示提示，避免热启动时闪一下
const SHOW_DELAY_MS = 800

// 全局唤醒提示：Render 冷启动期间在页面顶部显示"服务正在唤醒"，不挡住页面，用户可以照常输入
export default function WakeBanner() {
  const [status, setStatus] = useState(getWakeStatus)
  const [visible, setVisible] = useState(false)
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const unsubscribe = subscribeWakeStatus(setStatus)
    // 页面一打开就开始唤醒：用户还在输入账号密码时，后端已经在启动了
    wakeBackend()
    return unsubscribe
  }, [])

  useEffect(() => {
    if (status === 'failed') {
      setVisible(true)
      return
    }
    if (status !== 'waking') {
      setVisible(false)
      return
    }
    const startedAt = Date.now()
    setElapsed(0)
    const showTimer = setTimeout(() => setVisible(true), SHOW_DELAY_MS)
    const tick = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000)
    return () => {
      clearTimeout(showTimer)
      clearInterval(tick)
    }
  }, [status])

  if (!visible) return null

  const failed = status === 'failed'

  return (
    <div className="fixed top-4 inset-x-0 z-50 flex justify-center px-4 pointer-events-none">
      <div
        role="status"
        aria-live="polite"
        className={`pointer-events-auto w-full max-w-md rounded-xl shadow-lg border px-4 py-3 flex items-center gap-3 text-sm ${
          failed ? 'bg-red-50 border-red-100 text-red-700' : 'bg-white border-blue-100 text-gray-700'
        }`}
      >
        {failed ? (
          <>
            <span className="flex-1">暂时连不上服务器，请检查网络或稍后再试</span>
            <button
              type="button"
              onClick={() => wakeBackend()}
              className="shrink-0 px-3 py-1 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors"
            >
              重试
            </button>
          </>
        ) : (
          <>
            <span className="shrink-0 h-4 w-4 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
            {/* 窄屏需要换行时在逗号处断开，不把"秒"单独挤到下一行 */}
            <span className="flex-1">
              服务正在唤醒，<span className="whitespace-nowrap">首次访问需要 30~60 秒…</span>
            </span>
            {elapsed > 0 && <span className="shrink-0 text-xs text-gray-400 tabular-nums">{elapsed} 秒</span>}
          </>
        )}
      </div>
    </div>
  )
}
