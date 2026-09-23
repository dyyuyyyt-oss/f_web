import { useState, useEffect, useRef } from 'react'
import { fetchEventSource } from '@microsoft/fetch-event-source'
import ReactMarkdown from 'react-markdown'
import { useNavigate } from 'react-router-dom'
import { getCharacters, deleteCharacter } from '../api/characters'
import { getChatHistory, regenerateReply, clearChatHistory } from '../api/chat'
import { uploadChatImage } from '../api/upload'
import { resolveApiUrl } from '../api/config'
import { getToken } from '../api/http'
import { useAuth } from '../context/AuthContext'
import CreateCharacterModal from './CreateCharacterModal'
import EditAvatarModal from './EditAvatarModal'

// AI 消息的 Markdown 渲染样式：*星号* 包裹的动作/心理描写渲染成灰色斜体，增强沉浸感
const markdownComponents = {
  p: ({ children }) => (
    <p className="text-sm leading-relaxed whitespace-pre-wrap break-words mb-2 last:mb-0">
      {children}
    </p>
  ),
  em: ({ children }) => <em className="text-gray-400 italic">{children}</em>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
}

export default function ChatInterface() {
  const [characters, setCharacters] = useState([])
  const [selectedCharacterId, setSelectedCharacterId] = useState(null)
  const [messages, setMessages] = useState([])
  const [conversationId, setConversationId] = useState(null) // 当前角色对应的会话 ID，重新生成/清空历史都要用到
  const [clearError, setClearError] = useState('')
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isCharacterModalOpen, setIsCharacterModalOpen] = useState(false)
  const [editingCharacter, setEditingCharacter] = useState(null) // null = 创建模式，有值 = 编辑该角色
  const [deleteError, setDeleteError] = useState('')
  const [isEditAvatarModalOpen, setIsEditAvatarModalOpen] = useState(false)
  const [allowEmoji, setAllowEmoji] = useState(true)
  const [pendingImage, setPendingImage] = useState(null) // { url } 已上传成功、待随消息一起发送的图片
  const [isUploadingImage, setIsUploadingImage] = useState(false)
  const [imageUploadError, setImageUploadError] = useState('')
  const messagesEndRef = useRef(null)
  const fileInputRef = useRef(null)
  const navigate = useNavigate()
  const { logout } = useAuth()
  // 当前正在进行的 SSE 流式请求的 AbortController；切换角色或组件卸载时用它取消请求，
  // 避免上一个角色未结束的流式回复混进新角色的消息列表
  const streamControllerRef = useRef(null)
  // 始终指向"当前选中角色"的最新值，供 regenerate/清空历史等异步回调在 await 之后判断
  // 结果是否还对应着用户当前正在看的角色（避免异步返回时角色已经切换，写错了消息列表）
  const activeCharacterIdRef = useRef(null)

  // 中止当前正在进行的 SSE 流式请求（如果有）
  const abortActiveStream = () => {
    if (streamControllerRef.current) {
      streamControllerRef.current.abort()
      streamControllerRef.current = null
    }
  }

  // 组件卸载时确保中止进行中的请求，避免卸载后还有 setState 调用
  useEffect(() => {
    return () => {
      abortActiveStream()
    }
  }, [])

  // 选择图片后立即上传
  const handleImageSelect = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // 清空以允许重复选择同一文件
    if (!file) return

    setImageUploadError('')
    setIsUploadingImage(true)
    try {
      const { url } = await uploadChatImage(file)
      setPendingImage({ url })
    } catch (err) {
      setImageUploadError(err.message || '上传图片失败')
    } finally {
      setIsUploadingImage(false)
    }
  }

  const handleRemovePendingImage = () => {
    setPendingImage(null)
  }

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

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

  // 进入某个角色的聊天页（首次选中、切换角色、刷新页面后重新选中）时拉取历史消息；
  // 会话为空时后端会自动插入开场白，这里直接渲染后端返回的结果即可
  //
  // 切换角色时必须按顺序完成以下步骤，否则会出现"卡在正在输入"或历史消息串到别的角色上：
  // 1. 中止上一个角色可能还没结束的 SSE 流式请求
  // 2. 把"正在输入"状态重置为 false（不然如果切换发生在上一个角色回复过程中，这个状态永远不会被重置）
  // 3. 清空当前消息列表和 conversation_id，避免短暂展示上一个角色的内容
  // 4. 重新拉取新角色的历史（为空时后端自动插入开场白）并写回 conversation_id
  useEffect(() => {
    activeCharacterIdRef.current = selectedCharacterId

    abortActiveStream()
    setIsLoading(false)
    setMessages([])
    setConversationId(null)

    if (!selectedCharacterId) {
      return
    }

    // 防止拉取历史的请求还没返回时角色又被切换：只有请求发起时的角色仍是当前角色，才应用结果
    let cancelled = false

    const fetchHistory = async () => {
      try {
        const data = await getChatHistory(selectedCharacterId)
        if (cancelled) return
        setMessages(
          (data.messages || []).map((m) => ({ role: m.role, content: m.content, image_url: m.image_url }))
        )
        setConversationId(data.conversation_id ?? null)
      } catch (error) {
        if (cancelled) return
        console.error('Failed to fetch chat history:', error)
        setMessages([])
        setConversationId(null)
      }
    }

    fetchHistory()

    return () => {
      cancelled = true
    }
  }, [selectedCharacterId])

  // 创建或编辑角色成功后统一处理：新建就追加到列表，编辑就替换列表里对应的项，
  // 然后切到这个角色（编辑时通常本来就在聊它，重新赋值不会触发多余的历史刷新）
  const handleCharacterSaved = (savedCharacter) => {
    setCharacters((prev) => {
      const exists = prev.some((c) => c.id === savedCharacter.id)
      return exists
        ? prev.map((c) => (c.id === savedCharacter.id ? savedCharacter : c))
        : [...prev, savedCharacter]
    })
    setSelectedCharacterId(savedCharacter.id)
    setIsCharacterModalOpen(false)
    setEditingCharacter(null)
  }

  // 角色头像更新成功后，同步到列表中对应的角色
  const handleAvatarUpdated = (updatedCharacter) => {
    setCharacters((prev) =>
      prev.map((c) => (c.id === updatedCharacter.id ? updatedCharacter : c))
    )
    setIsEditAvatarModalOpen(false)
  }

  // 删除角色：需要用户二次确认，成功后从列表移除；如果删的正是当前正在聊的角色，
  // 自动切到列表里第一个角色（没有其他角色则清空选中，聊天界面会随之清空）
  const handleDeleteCharacter = async () => {
    if (!selectedCharacter) return

    const confirmed = window.confirm(
      `确定删除角色「${selectedCharacter.name}」吗？该操作会同时删除该角色的所有聊天记录，且不可恢复。`
    )
    if (!confirmed) return

    const deletedId = selectedCharacter.id
    setDeleteError('')
    try {
      await deleteCharacter(deletedId)
      const remaining = characters.filter((c) => c.id !== deletedId)
      setCharacters(remaining)
      setSelectedCharacterId(remaining.length > 0 ? remaining[0].id : null)
    } catch (error) {
      console.error('Delete character error:', error)
      setDeleteError(error.message || '删除角色失败，请重试')
    }
  }

  // 自动滚动到最新消息
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // 请求 AI 流式回复，写入 messages[aiMessageIndex]（发送新消息复用这个逻辑）
  // 用 AbortController 支持中途取消：切换角色或组件卸载时会调用 abortActiveStream() 中止请求，
  // 中止后不再触发任何 setState，避免把已经切走的角色的内容写进新角色的消息列表
  const streamAssistantReply = async (userMessage, imageUrl, aiMessageIndex) => {
    const controller = new AbortController()
    streamControllerRef.current = controller

    try {
      let aiResponse = ''

      const streamUrl =
        `/api/chat/stream?message=${encodeURIComponent(userMessage)}&character_id=${selectedCharacterId}&allow_emoji=${allowEmoji}` +
        (imageUrl ? `&image_url=${encodeURIComponent(imageUrl)}` : '')

      await fetchEventSource(
        resolveApiUrl(streamUrl),
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${getToken()}`,
          },
          signal: controller.signal,
          onmessage(event) {
            if (controller.signal.aborted || !event.data) return
            aiResponse += event.data
            setMessages((prev) => {
              const updated = [...prev]
              updated[aiMessageIndex] = {
                role: 'assistant',
                content: aiResponse,
              }
              return updated
            })
          },
          onerror(err) {
            // 主动 abort（切换角色/组件卸载）触发的错误直接抛出，交给外层 catch 静默处理，
            // 不覆盖已经切换过去的新角色消息；抛出还能终止 fetchEventSource 默认的自动重连
            if (controller.signal.aborted) {
              throw err
            }
            console.error('Stream error:', err)
            setMessages((prev) => {
              const updated = [...prev]
              updated[aiMessageIndex] = {
                role: 'assistant',
                content: '[错误] 无法获取 AI 回复，请重试',
              }
              return updated
            })
            // 不抛出的话 fetchEventSource 会一直自动重连，导致"正在输入"永远卡住，所以这里也要抛出终止重连
            throw err
          },
        }
      )
    } catch (error) {
      if (controller.signal.aborted) {
        // 主动取消，不是真正的失败，不需要提示用户
        return
      }
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
      if (streamControllerRef.current === controller) {
        streamControllerRef.current = null
      }
      if (!controller.signal.aborted) {
        setIsLoading(false)
      }
    }
  }

  // 处理发送消息（流式）
  const handleSendMessage = async () => {
    // 至少要有文字或图片其中之一
    if ((!inputValue.trim() && !pendingImage) || !selectedCharacterId || isLoading) return

    const userMessage = inputValue
    // 图片地址要转成绝对 URL 再传给后端：后端会把它转发给豆包识别，
    // 豆包在火山引擎那边运行，无法访问 /uploads/xxx.jpg 这种相对路径
    const imageUrl = pendingImage ? resolveApiUrl(pendingImage.url) : null
    setInputValue('')
    setPendingImage(null)

    // 添加用户消息（带图片时一并展示缩略图）
    setMessages((prev) => [...prev, { role: 'user', content: userMessage, image_url: imageUrl }])
    setIsLoading(true)

    // 占位符用于 AI 消息
    const aiMessageIndex = messages.length + 1
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }])

    await streamAssistantReply(userMessage, imageUrl, aiMessageIndex)
  }

  // 重新生成：调用后端 /api/chat/regenerate，由后端删除最后一条 assistant 消息并重新生成，
  // 不会像之前那样把用户消息重发一遍导致历史里出现重复的 user 消息
  const handleRegenerate = async () => {
    if (isLoading || messages.length === 0 || !conversationId) return

    const lastIndex = messages.length - 1
    if (messages[lastIndex].role !== 'assistant') return

    // 记录发起请求时的角色，等请求返回后要核对用户是否还在看这个角色，防止结果写错消息列表
    const requestCharacterId = selectedCharacterId

    setIsLoading(true)
    setMessages((prev) => {
      const updated = [...prev]
      updated[lastIndex] = { role: 'assistant', content: '' }
      return updated
    })

    try {
      const result = await regenerateReply(conversationId, allowEmoji)
      if (activeCharacterIdRef.current !== requestCharacterId) return
      setMessages((prev) => {
        const updated = [...prev]
        updated[lastIndex] = { role: 'assistant', content: result.reply }
        return updated
      })
    } catch (error) {
      if (activeCharacterIdRef.current !== requestCharacterId) return
      console.error('Regenerate error:', error)
      setMessages((prev) => {
        const updated = [...prev]
        updated[lastIndex] = { role: 'assistant', content: '[错误] 重新生成失败，请重试' }
        return updated
      })
    } finally {
      if (activeCharacterIdRef.current === requestCharacterId) {
        setIsLoading(false)
      }
    }
  }

  // 处理回车发送
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  // 清空对话：调用后端真正删除该会话的消息记录（保留会话本身），
  // 成功后再清空前端显示，这样刷新页面或切换角色再切回来都不会又加载出旧消息
  const handleClearMessages = async () => {
    if (!conversationId) {
      setMessages([])
      return
    }

    const requestCharacterId = selectedCharacterId
    setClearError('')
    try {
      await clearChatHistory(conversationId)
      if (activeCharacterIdRef.current !== requestCharacterId) return
      setMessages([])
    } catch (error) {
      if (activeCharacterIdRef.current !== requestCharacterId) return
      console.error('Clear history error:', error)
      setClearError(error.message || '清空对话失败，请重试')
    }
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
                  src={resolveApiUrl(selectedCharacter.avatar)}
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
            onChange={(e) => setSelectedCharacterId(Number(e.target.value))}
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
            onClick={() => {
              setEditingCharacter(selectedCharacter)
              setIsCharacterModalOpen(true)
            }}
            disabled={!selectedCharacter}
            className="px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="编辑角色"
            title="编辑角色"
          >
            ✏️ 编辑
          </button>
          <button
            onClick={handleDeleteCharacter}
            disabled={!selectedCharacter}
            className="px-3 py-2 text-sm bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="删除角色"
            title="删除角色"
          >
            🗑️ 删除
          </button>
          <button
            onClick={() => {
              setEditingCharacter(null)
              setIsCharacterModalOpen(true)
            }}
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
          <button
            onClick={handleLogout}
            className="px-4 py-2 text-sm bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
          >
            退出登录
          </button>
        </div>
        {selectedCharacter && (
          <p className="text-sm text-gray-500 mt-3">
            {selectedCharacter.description}
          </p>
        )}
        {clearError && (
          <p className="text-sm text-red-600 mt-2">{clearError}</p>
        )}
        {deleteError && (
          <p className="text-sm text-red-600 mt-2">{deleteError}</p>
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
                {msg.image_url && (
                  <img
                    src={msg.image_url}
                    alt="用户发送的图片"
                    className="max-w-full rounded-lg mb-2"
                  />
                )}
                {msg.content ? (
                  msg.role === 'assistant' ? (
                    <ReactMarkdown components={markdownComponents}>{msg.content}</ReactMarkdown>
                  ) : (
                    <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                      {msg.content}
                    </p>
                  )
                ) : (
                  msg.role === 'assistant' && (
                    <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                      正在输入...
                    </p>
                  )
                )}
                {msg.role === 'assistant' && idx === messages.length - 1 && msg.content && !isLoading && (
                  <button
                    onClick={handleRegenerate}
                    className="mt-1 text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
                  >
                    🔄 重新生成
                  </button>
                )}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 输入框 */}
      <div className="bg-white border-t border-gray-200 px-6 py-4 shadow-lg">
        {/* 待发送的图片预览 */}
        {(pendingImage || isUploadingImage) && (
          <div className="mb-2">
            {isUploadingImage ? (
              <div className="w-16 h-16 rounded-lg bg-gray-100 flex items-center justify-center text-xs text-gray-400">
                上传中...
              </div>
            ) : (
              <div className="relative w-16 h-16">
                <img
                  src={resolveApiUrl(pendingImage.url)}
                  alt="待发送图片"
                  className="w-16 h-16 rounded-lg object-cover border border-gray-200"
                />
                <button
                  onClick={handleRemovePendingImage}
                  className="absolute -top-2 -right-2 w-5 h-5 bg-gray-700 text-white rounded-full text-xs flex items-center justify-center hover:bg-gray-900"
                  aria-label="移除图片"
                >
                  ×
                </button>
              </div>
            )}
          </div>
        )}
        {imageUploadError && (
          <p className="text-xs text-red-600 mb-2">{imageUploadError}</p>
        )}

        <div className="flex gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={handleImageSelect}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading || isUploadingImage || !selectedCharacterId}
            className="px-3 py-3 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed self-end"
            aria-label="添加图片"
          >
            🖼️
          </button>
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
            disabled={isLoading || !selectedCharacterId || (!inputValue.trim() && !pendingImage)}
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
          💡 提示：支持 Shift+Enter 换行，单独 Enter 发送消息；点击 🖼️ 可附带一张图片
        </p>
      </div>

      {isCharacterModalOpen && (
        <CreateCharacterModal
          character={editingCharacter}
          onClose={() => {
            setIsCharacterModalOpen(false)
            setEditingCharacter(null)
          }}
          onSaved={handleCharacterSaved}
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
