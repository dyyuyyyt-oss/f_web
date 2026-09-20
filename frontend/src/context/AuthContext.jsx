import { createContext, useContext, useState, useEffect } from 'react'
import { login as apiLogin, getCurrentUser } from '../api/auth'
import { getToken, getStoredUser, clearAuth } from '../api/http'

const AuthContext = createContext(null)

// 全局登录态：应用启动时先用本地缓存的用户信息快速渲染，
// 同时用 /api/auth/me 向后端校验 token 是否仍然有效
export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => (getToken() ? getStoredUser() : null))
  const [isLoading, setIsLoading] = useState(!!getToken())

  useEffect(() => {
    if (!getToken()) {
      setIsLoading(false)
      return
    }

    getCurrentUser()
      .then(setUser)
      .catch(() => {
        clearAuth()
        setUser(null)
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
