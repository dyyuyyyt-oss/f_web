import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import RegisterModal from '../components/RegisterModal'

// 登录后要回到的页面：只接受站内路径（以单个 / 开头），防止 ?next= 被拿来跳到外部网站；
// 默认回功能大厅
function safeNextPath(search) {
  const next = new URLSearchParams(search).get('next')
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/login')) return '/'
  return next
}

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isRegisterOpen, setIsRegisterOpen] = useState(false)
  const [showForgotPassword, setShowForgotPassword] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!username.trim() || !password.trim()) {
      setError('请输入用户名和密码')
      return
    }

    setIsSubmitting(true)
    try {
      await login(username.trim(), password)
      navigate(safeNextPath(location.search), { replace: true })
    } catch (err) {
      setError(err.message || '登录失败')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="h-dvh flex items-center justify-center bg-desk-bg font-desk px-4">
      <div className="bg-desk-panel border border-desk-divider rounded-2xl shadow-2xl shadow-black/40 w-full max-w-sm px-6 py-8">
        <h1 className="text-2xl font-bold text-white text-center whitespace-nowrap mb-6">征</h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-desk-text-dim mb-1">用户名</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-transparent bg-desk-control text-desk-text placeholder:text-desk-text-faint focus:border-desk-accent outline-none text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-desk-text-dim mb-1">密码</label>
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

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full h-10 px-4 bg-desk-green text-desk-on-green rounded-btn hover:bg-desk-green-hover transition-colors disabled:bg-desk-control disabled:text-desk-text-faint disabled:cursor-not-allowed text-sm font-bold"
          >
            {isSubmitting ? '登录中...' : '登录'}
          </button>

          <button
            type="button"
            onClick={() => setIsRegisterOpen(true)}
            className="w-full h-10 px-4 bg-desk-control text-desk-text rounded-btn hover:bg-desk-control-hover transition-colors text-sm font-semibold"
          >
            注册
          </button>
        </form>

        <div className="text-center mt-4">
          <button
            type="button"
            onClick={() => setShowForgotPassword((prev) => !prev)}
            className="text-xs text-desk-text-faint hover:text-desk-text-dim underline"
          >
            忘记密码？
          </button>
          {showForgotPassword && (
            <p className="text-xs text-desk-text-dim mt-2">
              如有需要请联系管理员，邮箱：dyyuyyyt@gmail.com
            </p>
          )}
        </div>
      </div>

      {isRegisterOpen && <RegisterModal onClose={() => setIsRegisterOpen(false)} />}
    </div>
  )
}
