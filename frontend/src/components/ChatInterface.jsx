import { useState, useEffect, useRef } from 'react'
import { fetchEventSource } from '@microsoft/fetch-event-source'
import { useNavigate } from 'react-router-dom'
import { getCharacters, deleteCharacter } from '../api/characters'
import { getChatHistory, regenerateReply, clearChatHistory } from '../api/chat'
import { uploadChatImage } from '../api/upload'
import { resolveApiUrl } from '../api/config'
import { getToken } from '../api/http'
import { useAuth } from '../context/AuthContext'
import { buildChatMarkdown, chatExportFileName, downloadTextFile } from '../utils/chatFormat'
import ChatView from './ChatView'

// 宽屏（≥768px）默认展开角色栏，窄屏默认收起
const WIDE_SCREEN_QUERY = '(min-width: 768px)'
const isWideScreen = () => typeof window !== 'undefined' && window.matchMedia?.(WIDE_SCREEN_QUERY).matches

// 聊天界面的状态与请求：角色列表、历史、SSE 流式回复、重新生成、清空、图片上传、表情开关。
// 界面长什么样全部在 ChatView 里，这里不写任何样式，改界面不需要碰这个文件
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
  // 「思考」开关：随流式 / 重新生成请求带上 thinking 参数（后端当前还没有读取这个参数）
  const [thinking, setThinking] = useState(false)
  // 是否正在接收 SSE 流：只有这时「停止」可点（重新生成走的是普通请求，不能中途停止）
  const [isStreaming, setIsStreaming] = useState(false)
  // 上一条回复的耗时统计，显示在底部状态栏：{ firstTokenMs, totalMs, chars, stopped }
  const [lastStats, setLastStats] = useState(null)
  // 角色栏展开 / 收起（纯界面状态）
  const [isSidebarOpen, setIsSidebarOpen] = useState(isWideScreen)
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
  // 用户点「停止」时记下被停止的那个流，流结束时据此区分"用户停止"和"切换角色导致的中止"
  const userStoppedControllerRef = useRef(null)

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
          (data.messages || []).map((m) => ({ role: m.role, content: m.content, image_url: m.image_url, created_at: m.created_at }))
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
    setIsStreaming(true)

    // 耗时统计：从发出请求开始计时，记录收到第一段内容的时间
    const startedAt = performance.now()
    let firstTokenAt = null
    let aiResponse = ''

    try {
      const streamUrl =
        `/api/chat/stream?message=${encodeURIComponent(userMessage)}&character_id=${selectedCharacterId}&allow_emoji=${allowEmoji}` +
        `&thinking=${thinking}` +
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
            if (firstTokenAt === null) firstTokenAt = performance.now()
            aiResponse += event.data
            setMessages((prev) => {
              const updated = [...prev]
              updated[aiMessageIndex] = {
                ...updated[aiMessageIndex],
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
                ...updated[aiMessageIndex],
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
          ...updated[aiMessageIndex],
          role: 'assistant',
          content: '[错误] 网络连接失败',
        }
        return updated
      })
    } finally {
      if (streamControllerRef.current === controller) {
        streamControllerRef.current = null
      }
      // 期间如果已经开始了新的流（切换角色后立刻发消息），不要把新流的状态改掉
      if (!streamControllerRef.current) {
        setIsStreaming(false)
      }
      // 正常结束或用户主动停止才记统计；切换角色导致的中止不记
      const stoppedByUser = userStoppedControllerRef.current === controller
      if (!controller.signal.aborted || stoppedByUser) {
        setLastStats({
          firstTokenMs: firstTokenAt === null ? null : firstTokenAt - startedAt,
          totalMs: performance.now() - startedAt,
          chars: aiResponse.length,
          stopped: stoppedByUser,
        })
      }
      if (!controller.signal.aborted) {
        setIsLoading(false)
      }
    }
  }

  // 停止生成：中止当前的 SSE 流，已经收到的内容保留在界面上
  // （注意：后端要等整段回复生成完才写库，中途停止的这条回复不会被保存）
  const handleStop = () => {
    const controller = streamControllerRef.current
    if (!controller) return
    userStoppedControllerRef.current = controller
    abortActiveStream()
    setIsLoading(false)
    // 还没收到任何内容就停止了：把空的占位消息换成提示，避免一直显示输入中
    setMessages((prev) => {
      const last = prev[prev.length - 1]
      if (last?.role !== 'assistant' || last.content) return prev
      const updated = [...prev]
      updated[updated.length - 1] = { ...last, content: '（已停止生成）' }
      return updated
    })
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
    setMessages((prev) => [...prev, { role: 'user', content: userMessage, image_url: imageUrl, created_at: new Date().toISOString() }])
    setIsLoading(true)

    // 占位符用于 AI 消息
    const aiMessageIndex = messages.length + 1
    setMessages((prev) => [...prev, { role: 'assistant', content: '', created_at: new Date().toISOString() }])

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
    const startedAt = performance.now()
    setMessages((prev) => {
      const updated = [...prev]
      updated[lastIndex] = { role: 'assistant', content: '', created_at: new Date().toISOString() }
      return updated
    })

    try {
      const result = await regenerateReply(conversationId, allowEmoji, thinking)
      if (activeCharacterIdRef.current !== requestCharacterId) return
      setMessages((prev) => {
        const updated = [...prev]
        updated[lastIndex] = { role: 'assistant', content: result.reply, created_at: new Date().toISOString() }
        return updated
      })
      // 重新生成不是流式的，只有总耗时，没有首字时间
      setLastStats({ firstTokenMs: null, totalMs: performance.now() - startedAt, chars: result.reply.length, stopped: false })
    } catch (error) {
      if (activeCharacterIdRef.current !== requestCharacterId) return
      console.error('Regenerate error:', error)
      setMessages((prev) => {
        const updated = [...prev]
        updated[lastIndex] = { ...updated[lastIndex], role: 'assistant', content: '[错误] 重新生成失败，请重试' }
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

  // 以下几个是原来直接写在 JSX 里的内联回调，搬到这里命名后原样传给 ChatView
  const handleOpenEditCharacter = () => {
    setEditingCharacter(selectedCharacter)
    setIsCharacterModalOpen(true)
  }

  const handleOpenCreateCharacter = () => {
    setEditingCharacter(null)
    setIsCharacterModalOpen(true)
  }

  const handleCloseCharacterModal = () => {
    setIsCharacterModalOpen(false)
    setEditingCharacter(null)
  }

  // 「清」：清空前二次确认，确认后走原来的清空逻辑
  const handleClearWithConfirm = () => {
    const name = selectedCharacter ? `和「${selectedCharacter.name}」的` : ''
    if (!window.confirm(`确定清空${name}全部对话吗？清空后无法恢复。`)) return
    handleClearMessages()
  }

  // 「存」：把当前对话导出成 Markdown 文件（纯前端生成，不请求后端）
  const handleExport = () => {
    if (!selectedCharacter || messages.length === 0) return
    const now = new Date()
    downloadTextFile(
      chatExportFileName(selectedCharacter.name, now),
      buildChatMarkdown({ characterName: selectedCharacter.name, messages, exportedAt: now })
    )
  }

  // 窄屏上选完角色自动收起角色栏，把聊天区让出来
  const handleSelectCharacter = (id) => {
    setSelectedCharacterId(id)
    if (!isWideScreen()) setIsSidebarOpen(false)
  }

  // 「再」可用的条件与 handleRegenerate 里的判断一致：最后一条是已有内容的 AI 回复
  const lastMessage = messages[messages.length - 1]
  const canRegenerate =
    !isLoading && !!conversationId && lastMessage?.role === 'assistant' && !!lastMessage.content

  return (
    <ChatView
      characters={characters}
      selectedCharacter={selectedCharacter}
      selectedCharacterId={selectedCharacterId}
      messages={messages}
      isLoading={isLoading}
      inputValue={inputValue}
      allowEmoji={allowEmoji}
      pendingImage={pendingImage}
      isUploadingImage={isUploadingImage}
      imageUploadError={imageUploadError}
      clearError={clearError}
      deleteError={deleteError}
      isCharacterModalOpen={isCharacterModalOpen}
      editingCharacter={editingCharacter}
      isEditAvatarModalOpen={isEditAvatarModalOpen}
      messagesEndRef={messagesEndRef}
      fileInputRef={fileInputRef}
      onSelectCharacter={handleSelectCharacter}
      onOpenEditAvatar={() => setIsEditAvatarModalOpen(true)}
      onOpenEditCharacter={handleOpenEditCharacter}
      onDeleteCharacter={handleDeleteCharacter}
      onOpenCreateCharacter={handleOpenCreateCharacter}
      onClearMessages={handleClearWithConfirm}
      onAllowEmojiChange={setAllowEmoji}
      onLogout={handleLogout}
      onRegenerate={handleRegenerate}
      onInputChange={setInputValue}
      onKeyDown={handleKeyDown}
      onSendMessage={handleSendMessage}
      onImageSelect={handleImageSelect}
      onPickImage={() => fileInputRef.current?.click()}
      onRemovePendingImage={handleRemovePendingImage}
      onCloseCharacterModal={handleCloseCharacterModal}
      onCharacterSaved={handleCharacterSaved}
      onCloseEditAvatar={() => setIsEditAvatarModalOpen(false)}
      onAvatarUpdated={handleAvatarUpdated}
      thinking={thinking}
      onToggleThinking={() => setThinking((prev) => !prev)}
      isStreaming={isStreaming}
      onStop={handleStop}
      canRegenerate={canRegenerate}
      onExport={handleExport}
      lastStats={lastStats}
      isSidebarOpen={isSidebarOpen}
      onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
      onCloseSidebar={() => setIsSidebarOpen(false)}
    />
  )
}
