import { createContext, useContext, useState, useEffect } from 'react'
import { login as apiLogin, getCurrentUser } from '../api/auth'
import { getToken, getStoredUser, clearAuth } from '../api/http'

const AuthContext = createContext(null)

// 全局登录态：应用启动时先用本地缓存的用户信息快速渲染，
// 同时用 /api/auth/me 向后端校验 token 是否仍然有效
export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => (getToken() ? getStoredUser() : null))
  // 有缓存的用户信息就直接渲染页面，不必等 /api/auth/me 返回（后端冷启动时可能要等很久）；
  // 只有拿到 token 却没有缓存用户信息时，才需要等校验结果
  const [isLoading, setIsLoading] = useState(() => !!getToken() && !getStoredUser())

  useEffect(() => {
    if (!getToken()) {
      setIsLoading(false)
      return
    }

    getCurrentUser()
      .then(setUser)
      .catch((err) => {
        // 只有后端明确返回 401（token 无效或过期）才清掉登录态；
        // 超时、网络错误、后端冷启动、数据库故障都是暂时的，不应该把用户踢下线
        if (err?.status === 401) {
          clearAuth()
          setUser(null)
        }
      })
      .finally(() => setIsLoading(false))
  }, [])

  const login = async (username, password) => {
    const loggedInUser = await apiLogin(username, password)
    setUser(loggedInUser)
    return loggedInUser
  }

  const logout = () => {
    clearAuth()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
