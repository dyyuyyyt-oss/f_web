import { useState, useEffect } from 'react'
import ChatInterface from './components/ChatInterface'

function App() {
  return (
    <div className="h-screen flex flex-col bg-gradient-to-b from-blue-50 to-white">
      <header className="bg-gradient-to-r from-blue-600 to-blue-500 text-white py-4 px-6 shadow-lg">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold">✨ AI 角色扮演聊天</h1>
          <p className="text-blue-100 text-sm mt-1">与 AI 助手进行有趣的对话</p>
        </div>
      </header>
      
      <main className="flex-1 overflow-hidden">
        <ChatInterface />
      </main>
    </div>
  )
}

export default App
