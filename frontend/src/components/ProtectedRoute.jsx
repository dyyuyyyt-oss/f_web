import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

// 路由守卫：未登录跳转登录页；requireAdmin 时非管理员跳转回聊天首页
export default function ProtectedRoute({ children, requireAdmin = false }) {
  const { user, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center text-gray-400">
        加载中...
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (requireAdmin && user.role !== 'admin') {
    return <Navigate to="/" replace />
  }

  return children
}
