import { useState } from 'react'
import { register } from '../api/auth'

// 注册申请弹窗
// onClose: 关闭弹窗回调
export default function RegisterModal({ onClose }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!username.trim() || !password.trim()) {
      setError('用户名和密码为必填项')
      return
    }

    setIsSubmitting(true)
    try {
      await register(username.trim(), password)
      setSubmitted(true)
    } catch (err) {
      setError(err.message || '提交申请失败')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
      <div className="bg-desk-panel border border-desk-divider rounded-2xl shadow-2xl w-full max-w-sm font-desk">
        <div className="flex items-center justify-between px-6 py-4 border-b border-desk-divider bg-desk-header rounded-t-2xl">
          <h2 className="text-[17px] font-bold text-white">注册申请</h2>
          <button
            onClick={onClose}
            className="text-desk-text-dim hover:text-desk-text text-xl leading-none"
            aria-label="关闭"
          >
            ×
          </button>
        </div>

        {submitted ? (
          <div className="px-6 py-8 text-center space-y-4">
            <p className="text-desk-text">已提交，等待管理员审核</p>
            <button
              onClick={onClose}
              className="h-10 px-4 bg-desk-green text-desk-on-green rounded-btn hover:bg-desk-green-hover transition-colors text-sm font-bold"
            >
              知道了
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-desk-text-dim mb-1">意向用户名</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-transparent bg-desk-control text-desk-text placeholder:text-desk-text-faint focus:border-desk-accent outline-none text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-desk-text-dim mb-1">意向密码</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-transparent bg-desk-control text-desk-text placeholder:text-desk-text-faint focus:border-desk-accent outline-none text-sm"
              />
            </div>

            {error && (
              <p className="text-sm text-desk-accent bg-desk-accent/10 border border-desk-accent/30 rounded-xl px-3 py-2">
                {error}
              </p>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 h-10 px-4 bg-desk-control text-desk-text rounded-btn hover:bg-desk-control-hover transition-colors text-sm font-semibold"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 h-10 px-4 bg-desk-green text-desk-on-green rounded-btn hover:bg-desk-green-hover transition-colors disabled:bg-desk-control disabled:text-desk-text-faint disabled:cursor-not-allowed text-sm font-bold"
              >
                {isSubmitting ? '提交中...' : '提交申请'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
