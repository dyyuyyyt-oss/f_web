import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  getUsers,
  createUser,
  updateUser,
  deleteUser,
  getPendingRequests,
  approveRequest,
  rejectRequest,
} from '../api/admin'

export default function AdminDashboard() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const [users, setUsers] = useState([])
  const [pendingRequests, setPendingRequests] = useState([])
  const [error, setError] = useState('')

  const [editingId, setEditingId] = useState(null)
  const [editUsername, setEditUsername] = useState('')
  const [editPassword, setEditPassword] = useState('')

  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState('user')
  const [isCreating, setIsCreating] = useState(false)

  const loadData = async () => {
    try {
      const [usersData, requestsData] = await Promise.all([getUsers(), getPendingRequests()])
      setUsers(usersData)
      setPendingRequests(requestsData)
    } catch (err) {
      setError(err.message || '加载数据失败')
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  const startEdit = (u) => {
    setEditingId(u.id)
    setEditUsername(u.username)
    setEditPassword('')
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditUsername('')
    setEditPassword('')
  }

  const saveEdit = async (id) => {
    setError('')
    try {
      const payload = {}
      const original = users.find((u) => u.id === id)
      if (editUsername.trim() && editUsername.trim() !== original.username) {
        payload.username = editUsername.trim()
      }
      if (editPassword.trim()) {
        payload.password = editPassword.trim()
      }
      if (Object.keys(payload).length === 0) {
        cancelEdit()
        return
      }
      await updateUser(id, payload)
      cancelEdit()
      await loadData()
    } catch (err) {
      setError(err.message || '更新账号失败')
    }
  }

  const handleDelete = async (id) => {
    setError('')
    try {
      await deleteUser(id)
      await loadData()
    } catch (err) {
      setError(err.message || '删除账号失败')
    }
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    setError('')
    if (!newUsername.trim() || !newPassword.trim()) {
      setError('用户名和密码为必填项')
      return
    }
    setIsCreating(true)
    try {
      await createUser({ username: newUsername.trim(), password: newPassword.trim(), role: newRole })
      setNewUsername('')
      setNewPassword('')
      setNewRole('user')
      await loadData()
    } catch (err) {
      setError(err.message || '创建账号失败')
    } finally {
      setIsCreating(false)
    }
  }

  const handleApprove = async (id) => {
    setError('')
    try {
      await approveRequest(id)
      await loadData()
    } catch (err) {
      setError(err.message || '批准申请失败')
    }
  }

  const handleReject = async (id) => {
    setError('')
    try {
      await rejectRequest(id)
      await loadData()
    } catch (err) {
      setError(err.message || '拒绝申请失败')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gradient-to-r from-blue-600 to-blue-500 text-white py-4 px-6 shadow-lg flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Confur 的个人空间</h1>
          <p className="text-blue-100 text-sm mt-1">管理后台 · {user?.username}</p>
        </div>
        <button
          onClick={handleLogout}
          className="px-4 py-2 text-sm bg-white/20 rounded-lg hover:bg-white/30 transition-colors"
        >
          退出登录
        </button>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-8">
        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        {/* 账号列表 */}
        <section className="bg-white rounded-2xl shadow-sm border border-gray-100">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="font-bold text-gray-800">账号列表</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-100">
                  <th className="px-6 py-3 font-medium">用户名</th>
                  <th className="px-6 py-3 font-medium">角色</th>
                  <th className="px-6 py-3 font-medium">创建时间</th>
                  <th className="px-6 py-3 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-gray-50 last:border-0">
                    {editingId === u.id ? (
                      <>
                        <td className="px-6 py-3">
                          <input
                            type="text"
                            value={editUsername}
                            onChange={(e) => setEditUsername(e.target.value)}
                            className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                          />
                        </td>
                        <td className="px-6 py-3 text-gray-500">{u.role}</td>
                        <td className="px-6 py-3 text-gray-400">
                          <input
                            type="password"
                            placeholder="新密码（不改则留空）"
                            value={editPassword}
                            onChange={(e) => setEditPassword(e.target.value)}
                            className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                          />
                        </td>
                        <td className="px-6 py-3 space-x-2 whitespace-nowrap">
                          <button
                            onClick={() => saveEdit(u.id)}
                            className="text-sky-600 hover:underline"
                          >
                            保存
                          </button>
                          <button onClick={cancelEdit} className="text-gray-400 hover:underline">
                            取消
                          </button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-6 py-3 text-gray-800">{u.username}</td>
                        <td className="px-6 py-3 text-gray-500">
                          {u.role === 'admin' ? '管理员' : '普通用户'}
                        </td>
                        <td className="px-6 py-3 text-gray-400">
                          {new Date(u.created_at).toLocaleString()}
                        </td>
                        <td className="px-6 py-3 space-x-3 whitespace-nowrap">
                          <button
                            onClick={() => startEdit(u)}
                            className="text-sky-600 hover:underline"
                          >
                            编辑
                          </button>
                          <button
                            onClick={() => handleDelete(u.id)}
                            className="text-red-500 hover:underline"
                          >
                            删除
                          </button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-6 text-center text-gray-400">
                      暂无账号
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* 手动新增账号 */}
          <form
            onSubmit={handleCreate}
            className="px-6 py-4 border-t border-gray-100 flex flex-wrap items-end gap-3"
          >
            <div>
              <label className="block text-xs text-gray-500 mb-1">用户名</label>
              <input
                type="text"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                className="px-2 py-1.5 border border-gray-300 rounded text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">密码</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="px-2 py-1.5 border border-gray-300 rounded text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">角色</label>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value)}
                className="px-2 py-1.5 border border-gray-300 rounded text-sm"
              >
                <option value="user">普通用户</option>
                <option value="admin">管理员</option>
              </select>
            </div>
            <button
              type="submit"
              disabled={isCreating}
              className="px-4 py-1.5 bg-sky-500 text-white rounded-lg hover:bg-sky-600 transition-colors disabled:bg-gray-400 text-sm font-medium"
            >
              {isCreating ? '添加中...' : '+ 添加账号'}
            </button>
          </form>
        </section>

        {/* 待审核申请 */}
        <section className="bg-white rounded-2xl shadow-sm border border-gray-100">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="font-bold text-gray-800">待审核的注册申请</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-100">
                  <th className="px-6 py-3 font-medium">用户名</th>
                  <th className="px-6 py-3 font-medium">提交时间</th>
                  <th className="px-6 py-3 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {pendingRequests.map((req) => (
                  <tr key={req.id} className="border-b border-gray-50 last:border-0">
                    <td className="px-6 py-3 text-gray-800">{req.username}</td>
                    <td className="px-6 py-3 text-gray-400">
                      {new Date(req.created_at).toLocaleString()}
                    </td>
                    <td className="px-6 py-3 space-x-3 whitespace-nowrap">
                      <button
                        onClick={() => handleApprove(req.id)}
                        className="text-green-600 hover:underline"
                      >
                        同意
                      </button>
                      <button
                        onClick={() => handleReject(req.id)}
                        className="text-red-500 hover:underline"
                      >
                        拒绝
                      </button>
                    </td>
                  </tr>
                ))}
                {pendingRequests.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-6 py-6 text-center text-gray-400">
                      暂无待审核申请
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  )
}
