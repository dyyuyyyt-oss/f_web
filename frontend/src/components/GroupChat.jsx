import { useEffect, useRef, useState } from 'react'
import { fetchEventSource } from '@microsoft/fetch-event-source'
import { useSearchParams } from 'react-router-dom'
import { getCharacters } from '../api/characters'
import {
  clearGroupMessages,
  deleteGroup,
  getGroupConfig,
  getGroupMessages,
  groupChatRequest,
  listGroups,
} from '../api/groups'
import { resolveApiUrl } from '../api/config'
import { extractErrorMessage, getToken } from '../api/http'
import GroupChatView from './GroupChatView'

const WIDE_SCREEN_QUERY = '(min-width: 768px)'
const isWideScreen = () => typeof window !== 'undefined' && window.matchMedia?.(WIDE_SCREEN_QUERY).matches

// 后端没返回配置时的兜底（和后端默认值一致）
const DEFAULT_CONFIG = { min_members: 2, max_members: 3, max_speakers: 3 }

// 4xx 之类不该重试的错误：抛出它让 fetchEventSource 立刻结束，不自动重连
class FatalStreamError extends Error {}

// 给前端的每条消息一个稳定的 key：流式过程中按 key 更新，不依赖下标
let keySeq = 0
const nextKey = () => `m${++keySeq}`

const fromServer = (m) => ({
  key: `s${m.id}`,
  id: m.id,
  role: m.role,
  content: m.content,
  created_at: m.created_at,
  speaker: m.speaker,
})

// 群聊页的状态与请求：群列表、群聊历史、SSE（多个角色轮流发言）、停止、清空、解散。
// 界面全部在 GroupChatView 里，这里不写样式
export default function GroupChat() {
  const [groups, setGroups] = useState([])
  const [groupsLoaded, setGroupsLoaded] = useState(false)
  const [config, setConfig] = useState(DEFAULT_CONFIG)
  const [characters, setCharacters] = useState([])
  const [searchParams, setSearchParams] = useSearchParams()
  // 当前群放在地址栏（/group?g=3）：刷新后还停在这个群
  const selectedGroupId = Number(searchParams.get('g')) || null
  const [messages, setMessages] = useState([])
  const [conversationId, setConversationId] = useState(null)
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  // 正在发言的角色 ID：顶栏对应的头像会高亮
  const [speakingId, setSpeakingId] = useState(null)
  const [allowEmoji, setAllowEmoji] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [chatError, setChatError] = useState('')
  const [actionError, setActionError] = useState('')
  // 上一轮的统计，显示在底部状态栏：{ spoken, total, totalMs, stopped }
  const [lastStats, setLastStats] = useState(null)
  // 新建 / 编辑群弹窗：null 关闭；{ group: null } 新建；{ group } 编辑
  const [modal, setModal] = useState(null)
  const [isSidebarOpen, setIsSidebarOpen] = useState(isWideScreen)
  const messagesEndRef = useRef(null)
  const streamControllerRef = useRef(null)
  const userStoppedControllerRef = useRef(null)
  const activeGroupIdRef = useRef(null)

  const abortActiveStream = () => {
    if (streamControllerRef.current) {
      streamControllerRef.current.abort()
      streamControllerRef.current = null
    }
  }

  useEffect(() => () => abortActiveStream(), [])

  const selectGroup = (id, { replace = false } = {}) => {
    setSearchParams(id ? { g: String(id) } : {}, { replace })
  }

  // 首次进入：群列表、群聊限制、可选角色一起拉
  useEffect(() => {
    let cancelled = false
    Promise.all([listGroups(), getGroupConfig().catch(() => DEFAULT_CONFIG), getCharacters().catch(() => [])])
      .then(([groupList, cfg, chars]) => {
        if (cancelled) return
        setGroups(groupList)
        setConfig(cfg)
        setCharacters(chars || [])
        setGroupsLoaded(true)
      })
      .catch((err) => {
        if (cancelled) return
        setLoadError(err.message || '获取群列表失败')
        setGroupsLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // 地址栏里没有群（或群已不存在）时，自动选中第一个
  useEffect(() => {
    if (!groupsLoaded) return
    if (selectedGroupId && groups.some((g) => g.id === selectedGroupId)) return
    if (groups.length > 0) selectGroup(groups[0].id, { replace: true })
    else if (selectedGroupId) selectGroup(null, { replace: true })
  }, [groupsLoaded, groups, selectedGroupId])

  const selectedGroup = groups.find((g) => g.id === selectedGroupId) || null

  // 切换群：中止上一个群还没结束的流 → 清空 → 拉新群的历史
  useEffect(() => {
    activeGroupIdRef.current = selectedGroup?.id ?? null
    abortActiveStream()
    setIsLoading(false)
    setIsStreaming(false)
    setSpeakingId(null)
    setMessages([])
    setConversationId(null)
    setChatError('')
    setActionError('')
    setLastStats(null)
    if (!selectedGroup) return

    let cancelled = false
    getGroupMessages(selectedGroup.id)
      .then((data) => {
        if (cancelled) return
        setMessages((data.messages || []).map(fromServer))
        setConversationId(data.conversation_id ?? null)
      })
      .catch((err) => {
        if (cancelled) return
        setChatError(err.message || '获取群聊记录失败')
      })
    return () => {
      cancelled = true
    }
    // 只在换群时重新拉；成员改了（编辑群）不需要重拉历史
  }, [selectedGroup?.id])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const updateMessage = (key, fn) => setMessages((prev) => prev.map((m) => (m.key === key ? fn(m) : m)))

  // 消费群聊 SSE：每个 speaker_start 新起一条角色消息，content 追加到这条，speaker_end 收尾
  const streamGroupReply = async (groupId, message) => {
    const controller = new AbortController()
    streamControllerRef.current = controller
    setIsStreaming(true)
    const startedAt = performance.now()
    const total = Math.min(selectedGroup.members.length, config.max_speakers || DEFAULT_CONFIG.max_speakers)
    let currentKey = null
    let currentHasContent = false // 当前角色是否已经说出内容（停止时它的半段也会被保存，算作发过言）
    let spoken = 0

    try {
      const { path, method, body } = groupChatRequest(groupId, { message, conversationId, allowEmoji })
      await fetchEventSource(resolveApiUrl(path), {
        method,
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body,
        signal: controller.signal,
        // 切到别的标签页时不断开，否则切回来会把这句话重新发一遍
        openWhenHidden: true,
        async onopen(response) {
          if (response.ok && response.headers.get('content-type')?.includes('text/event-stream')) return
          throw new FatalStreamError(await extractErrorMessage(response, '发送失败，请重试'))
        },
        onmessage(event) {
          if (controller.signal.aborted || !event.data) return
          let data
          try {
            data = JSON.parse(event.data)
          } catch {
            return
          }
          switch (data.type) {
            case 'start':
              setConversationId(data.conversation_id)
              break
            case 'speaker_start': {
              const key = nextKey()
              currentKey = key
              currentHasContent = false
              setSpeakingId(data.speaker.id)
              setMessages((prev) => [
                ...prev,
                { key, role: 'assistant', content: '', speaker: data.speaker, created_at: new Date().toISOString(), pending: true },
              ])
              break
            }
            case 'content':
              if (currentKey) {
                const key = currentKey
                currentHasContent = true
                updateMessage(key, (m) => ({ ...m, content: m.content + data.text }))
              }
              break
            case 'error':
              // 某个角色失败：后端会跳过它继续下一个，这里在它的消息位置上标注原因
              if (data.speaker_id && currentKey) {
                const key = currentKey
                updateMessage(key, (m) => ({ ...m, error: data.message }))
              } else {
                setChatError(data.message || '群聊出错，请重试')
              }
              break
            case 'speaker_end': {
              const key = currentKey
              currentKey = null
              setSpeakingId(null)
              if (data.message_id) {
                spoken += 1
                updateMessage(key, (m) => ({ ...m, id: data.message_id, pending: false }))
              } else {
                // 没说出内容：有错误就留着错误提示（不落库，刷新后消失），没有错误就直接去掉
                setMessages((prev) =>
                  prev.flatMap((m) => (m.key !== key ? [m] : m.error ? [{ ...m, pending: false }] : []))
                )
              }
              break
            }
            default:
              break
          }
        },
        onerror(err) {
          // 抛出 = 不重连（默认会自动重连，导致同一句话被发两遍）
          throw err
        },
      })
    } catch (error) {
      if (!controller.signal.aborted) {
        console.error('Group chat error:', error)
        setChatError(error instanceof FatalStreamError ? error.message : '连接中断，请重试')
        // 正在发言的那条：有内容就保留，没内容就去掉
        setMessages((prev) => prev.filter((m) => !(m.pending && !m.content)).map((m) => (m.pending ? { ...m, pending: false } : m)))
      }
    } finally {
      if (streamControllerRef.current === controller) streamControllerRef.current = null
      if (!streamControllerRef.current) setIsStreaming(false)
      const stoppedByUser = userStoppedControllerRef.current === controller
      if (currentKey && currentHasContent) spoken += 1 // 说到一半被停止 / 断开的那位
      if (!controller.signal.aborted || stoppedByUser) {
        setLastStats({ spoken, total, totalMs: performance.now() - startedAt, stopped: stoppedByUser })
      }
      if (!controller.signal.aborted) {
        setIsLoading(false)
        setSpeakingId(null)
      }
    }
  }

  const handleSendMessage = async () => {
    if (!inputValue.trim() || !selectedGroup || isLoading) return
    const text = inputValue
    setInputValue('')
    setChatError('')
    setActionError('')
    setMessages((prev) => [...prev, { key: nextKey(), role: 'user', content: text, created_at: new Date().toISOString() }])
    setIsLoading(true)
    await streamGroupReply(selectedGroup.id, text)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  // 停止：断开 SSE。后端会把当前角色已说出的部分存下来，后面的角色不再发言
  const handleStop = () => {
    const controller = streamControllerRef.current
    if (!controller) return
    userStoppedControllerRef.current = controller
    abortActiveStream()
    setIsLoading(false)
    setSpeakingId(null)
    setMessages((prev) => prev.filter((m) => !(m.pending && !m.content)).map((m) => (m.pending ? { ...m, pending: false } : m)))
  }

  const handleClear = async () => {
    if (!selectedGroup) return
    if (!window.confirm(`确定清空「${selectedGroup.name}」的全部聊天记录吗？清空后无法恢复。`)) return
    const groupId = selectedGroup.id
    setActionError('')
    try {
      await clearGroupMessages(groupId)
      if (activeGroupIdRef.current !== groupId) return
      setMessages([])
      setLastStats(null)
    } catch (err) {
      if (activeGroupIdRef.current !== groupId) return
      setActionError(err.message || '清空失败，请重试')
    }
  }

  // 退出群聊：群里只有你一个真人，退出就是解散（群和聊天记录一起删除）
  const handleLeave = async () => {
    if (!selectedGroup) return
    const ok = window.confirm(`确定退出「${selectedGroup.name}」吗？\n退出后这个群会解散，聊天记录一并删除，且不可恢复。`)
    if (!ok) return
    const groupId = selectedGroup.id
    setActionError('')
    try {
      abortActiveStream()
      await deleteGroup(groupId)
      const remaining = groups.filter((g) => g.id !== groupId)
      setGroups(remaining)
      selectGroup(remaining[0]?.id ?? null, { replace: true })
    } catch (err) {
      setActionError(err.message || '退出群聊失败，请重试')
    }
  }

  const handleGroupSaved = (saved) => {
    setGroups((prev) => (prev.some((g) => g.id === saved.id) ? prev.map((g) => (g.id === saved.id ? saved : g)) : [saved, ...prev]))
    setModal(null)
    selectGroup(saved.id)
    if (!isWideScreen()) setIsSidebarOpen(false)
  }

  const handleSelectGroup = (id) => {
    if (id !== selectedGroupId) selectGroup(id)
    if (!isWideScreen()) setIsSidebarOpen(false)
  }

  return (
    <GroupChatView
      groups={groups}
      groupsLoaded={groupsLoaded}
      config={config}
      characters={characters}
      selectedGroup={selectedGroup}
      messages={messages}
      inputValue={inputValue}
      isLoading={isLoading}
      isStreaming={isStreaming}
      speakingId={speakingId}
      allowEmoji={allowEmoji}
      errors={[loadError, chatError, actionError].filter(Boolean)}
      lastStats={lastStats}
      modal={modal}
      isSidebarOpen={isSidebarOpen}
      messagesEndRef={messagesEndRef}
      onSelectGroup={handleSelectGroup}
      onOpenCreate={() => setModal({ group: null })}
      onOpenEdit={() => selectedGroup && setModal({ group: selectedGroup })}
      onCloseModal={() => setModal(null)}
      onGroupSaved={handleGroupSaved}
      onAllowEmojiChange={setAllowEmoji}
      onInputChange={setInputValue}
      onKeyDown={handleKeyDown}
      onSendMessage={handleSendMessage}
      onStop={handleStop}
      onClear={handleClear}
      onLeave={handleLeave}
      onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
      onCloseSidebar={() => setIsSidebarOpen(false)}
    />
  )
}
