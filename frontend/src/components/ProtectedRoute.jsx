import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

// 路由守卫：未登录跳转登录页，并用 ?next= 记住原来要去的页面，登录后回到那里；
// requireAdmin 时非管理员跳转回功能大厅
export default function ProtectedRoute({ children, requireAdmin = false }) {
  const { user, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center text-gray-400">
        加载中...
      </div>
    )
  }

  if (!user) {
    const next = location.pathname + location.search
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />
  }

  if (requireAdmin && user.role !== 'admin') {
    return <Navigate to="/" replace />
  }

  return children
}
