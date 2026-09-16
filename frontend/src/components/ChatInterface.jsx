import { useState, useEffect, useRef } from 'react'
import { fetchEventSource } from '@microsoft/fetch-event-source'
import { getCharacters } from '../api/characters'
import CreateCharacterModal from './CreateCharacterModal'
import EditAvatarModal from './EditAvatarModal'

export default function ChatInterface() {
  const [characters, setCharacters] = useState([])
  const [selectedCharacterId, setSelectedCharacterId] = useState(null)
  const [messages, setMessages] = useState([])
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isEditAvatarModalOpen, setIsEditAvatarModalOpen] = useState(false)
  const [allowEmoji, setAllowEmoji] = useState(true)
  const messagesEndRef = useRef(null)

  // 获取角色列表
  useEffect(() => {
    const fetchCharacters = async () => {
      try {
        const data = await getCharacters()
        setCharacters(data || [])
        if (data && data.length > 0) {
          setSelectedCharacterId(data[0].id)
        }
      } catch (error) {
        console.error('Failed to fetch characters:', error)
      }
    }

    fetchCharacters()
  }, [])

  // 新角色创建成功后，追加到列表并自动选中
  const handleCharacterCreated = (newCharacter) => {
    setCharacters((prev) => [...prev, newCharacter])
    setSelectedCharacterId(newCharacter.id)
    setMessages([])
    setIsCreateModalOpen(false)
  }

  // 角色头像更新成功后，同步到列表中对应的角色
  const handleAvatarUpdated = (updatedCharacter) => {
    setCharacters((prev) =>
      prev.map((c) => (c.id === updatedCharacter.id ? updatedCharacter : c))
    )
    setIsEditAvatarModalOpen(false)
  }

  // 自动滚动到最新消息
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // 处理发送消息（流式）
  const handleSendMessage = async () => {
    if (!inputValue.trim() || !selectedCharacterId || isLoading) return

    const userMessage = inputValue
    setInputValue('')
    
    // 添加用户消息
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }])
    setIsLoading(true)

    // 占位符用于 AI 消息
    const aiMessageIndex = messages.length + 1
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }])

    try {
      let aiResponse = ''

      await fetchEventSource(
        `/api/chat/stream?message=${encodeURIComponent(userMessage)}&character_id=${selectedCharacterId}&user_id=1&allow_emoji=${allowEmoji}`,
        {
          method: 'GET',
          onmessage(event) {
            if (event.data) {
              aiResponse += event.data
              setMessages((prev) => {
                const updated = [...prev]
                updated[aiMessageIndex] = {
                  role: 'assistant',
                  content: aiResponse,
                }
                return updated
              })
            }
          },
          onerror(err) {
            console.error('Stream error:', err)
            setMessages((prev) => {
              const updated = [...prev]
              updated[aiMessageIndex] = {
                role: 'assistant',
                content: '[错误] 无法获取 AI 回复，请重试',
              }
              return updated
            })
          },
        }
      )
    } catch (error) {
      console.error('Send message error:', error)
      setMessages((prev) => {
        const updated = [...prev]
        updated[aiMessageIndex] = {
          role: 'assistant',
          content: '[错误] 网络连接失败',
        }
        return updated
      })
    } finally {
      setIsLoading(false)
    }
  }

  // 处理回车发送
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  // 清空对话
  const handleClearMessages = () => {
    setMessages([])
  }

  const selectedCharacter = characters.find((c) => c.id === selectedCharacterId)

  return (
    <div className="max-w-4xl mx-auto w-full h-full flex flex-col">
      {/* 角色选择 */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 shadow-sm">
        <div className="flex items-center gap-4">
          {selectedCharacter && (
            <div className="w-9 h-9 rounded-full bg-gray-100 overflow-hidden flex items-center justify-center border border-gray-200 shrink-0">
              {selectedCharacter.avatar ? (
                <img
                  src={selectedCharacter.avatar}
                  alt={selectedCharacter.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-lg">🙂</span>
              )}
            </div>
          )}
          <label className="font-semibold text-gray-700">选择角色：</label>
          <select
            value={selectedCharacterId || ''}
            onChange={(e) => {
              setSelectedCharacterId(Number(e.target.value))
              setMessages([])
            }}
            className="flex-1 max-w-xs px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          >
            {characters.map((char) => (
              <option key={char.id} value={char.id}>
                {char.name}
              </option>
            ))}
          </select>
          <button
            onClick={() => setIsEditAvatarModalOpen(true)}
            disabled={!selectedCharacter}
            className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            更换头像
          </button>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="px-4 py-2 text-sm bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors font-medium"
          >
            + 创建角色
          </button>
          <button
            onClick={handleClearMessages}
            className="px-4 py-2 text-sm bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors"
          >
            清空对话
          </button>
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={allowEmoji}
              onChange={(e) => setAllowEmoji(e.target.checked)}
              className="w-4 h-4 accent-blue-600"
            />
            允许表情回复
          </label>
        </div>
        {selectedCharacter && (
          <p className="text-sm text-gray-500 mt-3">
            {selectedCharacter.description}
          </p>
        )}
      </div>

      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center text-gray-400">
              <p className="text-lg mb-2">👋 开始聊天吧！</p>
              <p className="text-sm">输入你的问题或与 AI 进行对话</p>
            </div>
          </div>
        ) : (
          messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex ${
                msg.role === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              <div
                className={`max-w-xs lg:max-w-md xl:max-w-lg px-4 py-3 rounded-lg shadow ${
                  msg.role === 'user'
                    ? 'bg-blue-500 text-white rounded-br-none'
                    : 'bg-white text-gray-800 border border-gray-200 rounded-bl-none'
                }`}
              >
                <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                  {msg.content || '正在输入...'}
                </p>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 输入框 */}
      <div className="bg-white border-t border-gray-200 px-6 py-4 shadow-lg">
        <div className="flex gap-3">
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入你的问题...（Shift+Enter 换行, Enter 发送）"
            disabled={isLoading || !selectedCharacterId}
            className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none disabled:bg-gray-100 disabled:cursor-not-allowed"
            rows="3"
          />
          <button
            onClick={handleSendMessage}
            disabled={isLoading || !selectedCharacterId || !inputValue.trim()}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed font-semibold flex items-center gap-2 self-end"
          >
            {isLoading ? (
              <>
                <span className="inline-block animate-spin">⏳</span>
                发送中...
              </>
            ) : (
              <>
                <span>📤</span>
                发送
              </>
            )}
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          💡 提示：支持 Shift+Enter 换行，单独 Enter 发送消息
        </p>
      </div>

      {isCreateModalOpen && (
        <CreateCharacterModal
          onClose={() => setIsCreateModalOpen(false)}
          onCreated={handleCharacterCreated}
        />
      )}

      {isEditAvatarModalOpen && selectedCharacter && (
        <EditAvatarModal
          character={selectedCharacter}
          onClose={() => setIsEditAvatarModalOpen(false)}
          onUpdated={handleAvatarUpdated}
        />
      )}
    </div>
  )
}
