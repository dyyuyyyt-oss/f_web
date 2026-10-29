import { Link } from 'react-router-dom'
import ChatInterface from '../components/ChatInterface'

// 聊天页（/chat）：从功能大厅进入，顶栏提供回大厅的入口
export default function ChatPage() {
  return (
    <div className="h-screen flex flex-col bg-gradient-to-b from-blue-50 to-white">
      <header className="bg-gradient-to-r from-blue-600 to-blue-500 text-white py-5 px-6 shadow-lg">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <h1 className="text-2xl font-bold whitespace-nowrap">征</h1>
          <Link to="/" className="px-4 py-2 text-sm bg-white/20 rounded-lg hover:bg-white/30 transition-colors">
            返回大厅
          </Link>
        </div>
      </header>

      <main className="flex-1 overflow-hidden">
        <ChatInterface />
      </main>
    </div>
  )
}
