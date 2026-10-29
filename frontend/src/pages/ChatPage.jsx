import ChatInterface from '../components/ChatInterface'

// 聊天页：原 App.jsx 中 "/" 路由的整块 JSX 原样搬过来，功能不变
// header 暂时保持原样，T4 抽出共用 Header 后再替换
export default function ChatPage() {
  return (
    <div className="h-screen flex flex-col bg-gradient-to-b from-blue-50 to-white">
      <header className="bg-gradient-to-r from-blue-600 to-blue-500 text-white py-5 px-6 shadow-lg">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold whitespace-nowrap">征</h1>
        </div>
      </header>

      <main className="flex-1 overflow-hidden">
        <ChatInterface />
      </main>
    </div>
  )
}
