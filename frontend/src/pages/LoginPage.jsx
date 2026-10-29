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
    <div className="h-screen flex items-center justify-center bg-sky-400 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm px-6 py-8">
        <h1 className="text-2xl font-bold text-gray-800 text-center whitespace-nowrap mb-6">征</h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">用户名</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-transparent outline-none text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-transparent outline-none text-sm"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full px-4 py-2 bg-sky-500 text-white rounded-lg hover:bg-sky-600 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed text-sm font-medium"
          >
            {isSubmitting ? '登录中...' : '登录'}
          </button>

          <button
            type="button"
            onClick={() => setIsRegisterOpen(true)}
            className="w-full px-4 py-2 border border-sky-500 text-sky-600 rounded-lg hover:bg-sky-50 transition-colors text-sm font-medium"
          >
            注册
          </button>
        </form>

        <div className="text-center mt-4">
          <button
            type="button"
            onClick={() => setShowForgotPassword((prev) => !prev)}
            className="text-xs text-gray-400 hover:text-gray-600 underline"
          >
            忘记密码？
          </button>
          {showForgotPassword && (
            <p className="text-xs text-gray-500 mt-2">
              如有需要请联系管理员，邮箱：dyyuyyyt@gmail.com
            </p>
          )}
        </div>
      </div>

      {isRegisterOpen && <RegisterModal onClose={() => setIsRegisterOpen(false)} />}
    </div>
  )
}
