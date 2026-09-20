import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import LoginPage from './pages/LoginPage'
import AdminDashboard from './pages/AdminDashboard'
import ChatInterface from './components/ChatInterface'

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/admin"
            element={
              <ProtectedRoute requireAdmin>
                <AdminDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <div className="h-screen flex flex-col bg-gradient-to-b from-blue-50 to-white">
                  <header className="bg-gradient-to-r from-blue-600 to-blue-500 text-white py-4 px-6 shadow-lg">
                    <div className="max-w-4xl mx-auto">
                      <h1 className="text-2xl font-bold">✨ Confur 的个人空间</h1>
                      <p className="text-blue-100 text-sm mt-1">与 AI 助手进行有趣的对话</p>
                    </div>
                  </header>

                  <main className="flex-1 overflow-hidden">
                    <ChatInterface />
                  </main>
                </div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
