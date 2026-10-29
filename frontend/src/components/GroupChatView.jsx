import { useLayoutEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import { formatMessageTime, formatSeconds } from '../utils/chatFormat'
import { Avatar, IconButton, markdownComponents } from './ChatView'
import GroupFormModal from './GroupFormModal'

// 群聊页的纯展示部分：数据和事件都由 GroupChat 通过 props 传入。
// 视觉沿用聊天页（ChatView）的暗色桌面风格；不做人物立绘，顶部用群名 + 渐变色块

const MAX_HEADER_AVATARS = 5

// 群的「头像」：渐变底 + 群名首字
function GroupBadge({ group, className = 'h-9 w-9 text-sm' }) {
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full bg-desk-banner font-bold text-white ring-1 ring-desk-divider ${className}`}>
      {group?.name?.slice(0, 1) || '群'}
    </span>
  )
}

// 顶栏的成员头像横排：最多 5 个，多出来的显示 +N；正在发言的角色描绿边
function MemberAvatars({ members, speakingId }) {
  const shown = members.slice(0, MAX_HEADER_AVATARS)
  const extra = members.length - shown.length
  return (
    <div className="flex shrink-0 flex-nowrap items-center -space-x-2" aria-label={`群成员：${members.map((m) => m.name).join('、')}`}>
      {shown.map((m, i) => (
        <span
          key={m.character_id}
          title={`${i + 1}. ${m.name}${m.character_id === speakingId ? '（正在发言）' : ''}`}
          data-speaking={m.character_id === speakingId ? 'true' : undefined}
          className={`relative rounded-full ring-2 transition-shadow ${m.character_id === speakingId ? 'z-10 ring-desk-green' : 'ring-desk-header'}`}
        >
          <Avatar character={m} className="h-7 w-7" />
        </span>
      ))}
      {extra > 0 && (
        <span className="relative flex h-7 min-w-[28px] items-center justify-center rounded-full bg-desk-control px-1 text-[11px] font-bold text-desk-text-dim ring-2 ring-desk-header">
          +{extra}
        </span>
      )}
    </div>
  )
}

function GroupSidebar({ groups, groupsLoaded, selectedGroup, isOpen, allowEmoji, onSelectGroup, onOpenCreate, onOpenEdit, onAllowEmojiChange, onClose }) {
  return (
    <>
      {isOpen && <div className="fixed inset-0 z-30 bg-black/50 md:hidden" onClick={onClose} aria-hidden="true" />}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-desk-divider bg-desk-panel transition-transform duration-200 md:static md:z-auto md:transition-none ${
          isOpen ? 'translate-x-0' : 'invisible -translate-x-full md:hidden'
        }`}
        aria-label="群列表"
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-desk-divider bg-desk-header px-4">
          <Link to="/" className="text-sm font-semibold text-desk-text-dim transition-colors hover:text-desk-text">
            ‹ 功能大厅
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="flex h-[30px] w-[30px] items-center justify-center rounded-btn text-desk-text-dim transition-colors hover:bg-desk-control hover:text-desk-text"
            aria-label="收起群列表"
            title="收起群列表"
          >
            ×
          </button>
        </div>

        <p className="px-4 pb-2 pt-4 text-xs font-semibold text-desk-text-faint">我的群聊</p>
        <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-2">
          {groupsLoaded && groups.length === 0 && <li className="px-2 py-3 text-xs text-desk-text-faint">还没有群</li>}
          {groups.map((g) => {
            const selected = g.id === selectedGroup?.id
            return (
              <li key={g.id}>
                <button
                  type="button"
                  onClick={() => onSelectGroup(g.id)}
                  aria-current={selected ? 'true' : undefined}
                  className={`flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors ${selected ? 'bg-desk-header' : 'hover:bg-desk-control'}`}
                >
                  <GroupBadge group={g} />
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-sm font-semibold ${selected ? 'text-white' : 'text-desk-text-dim'}`}>{g.name}</span>
                    <span className="block truncate text-[11px] text-desk-text-faint">{g.members.map((m) => m.name).join('、') || '没有成员'}</span>
                  </span>
                </button>
                {selected && (
                  <div className="flex gap-1 px-2 pb-1 pt-1.5 pl-[56px]">
                    <button
                      type="button"
                      onClick={onOpenEdit}
                      className="rounded-md px-2 py-1 text-xs text-desk-text-dim transition-colors hover:bg-desk-control hover:text-desk-text"
                    >
                      编辑成员 / 顺序
                    </button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>

        <div className="shrink-0 space-y-3 border-t border-desk-divider p-3">
          <label className="flex cursor-pointer select-none items-center justify-between px-1 text-sm text-desk-text-dim">
            允许表情回复
            <input type="checkbox" checked={allowEmoji} onChange={(e) => onAllowEmojiChange(e.target.checked)} className="peer sr-only" />
            <span className="relative h-5 w-9 rounded-full bg-desk-control transition-colors peer-checked:bg-desk-green peer-focus-visible:ring-2 peer-focus-visible:ring-desk-accent after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-4" />
          </label>
          <button
            type="button"
            onClick={onOpenCreate}
            className="h-10 w-full rounded-btn bg-desk-green text-sm font-bold text-desk-on-green transition-colors hover:bg-desk-green-hover"
          >
            + 新建群聊
          </button>
        </div>
      </aside>
    </>
  )
}

// 群名 + 渐变色块（代替单聊页的人物立绘）
function GroupBand({ group, minMembers }) {
  const names = group.members.map((m) => m.name)
  return (
    <div className="relative flex h-[84px] shrink-0 flex-col justify-center overflow-hidden bg-desk-banner px-5 pb-3 sm:h-[120px] sm:px-6">
      <p className="relative z-10 truncate text-xl font-bold text-white sm:text-2xl">{group.name}</p>
      <p className="relative z-10 mt-1 truncate text-xs text-desk-text-dim">
        {names.length < minMembers
          ? `成员不足 ${minMembers} 个，点左侧「编辑成员」补上`
          : `${names.length} 位成员 · 发言顺序：${names.join(' → ')}`}
      </p>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[45%] bg-gradient-to-b from-transparent to-desk-panel" />
    </div>
  )
}

function GroupMessageList({ messages, group, isLoading, messagesEndRef }) {
  if (messages.length === 0) {
    const names = group.members.map((m) => m.name)
    return (
      <div className="flex h-full items-center justify-center text-center text-sm text-desk-text-faint">
        <div>
          <p className="mb-1 text-base text-desk-text-dim">群里还很安静</p>
          <p>说一句话，{names.length > 0 ? names.join('、') : '群里的角色'} 会依次接话</p>
        </div>
      </div>
    )
  }

  return (
    <>
      {messages.map((msg) => {
        const isUser = msg.role === 'user'
        const isGenerating = !isUser && isLoading && msg.pending
        const name = isUser ? '你' : msg.speaker?.name || '（已删除的角色）'
        return (
          <div key={msg.key} className="mb-[18px] flex gap-3 last:mb-0" data-role={msg.role} data-speaker-id={msg.speaker?.id}>
            {isUser ? (
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-desk-green/15 text-xs font-bold text-desk-user-name ring-1 ring-desk-divider">
                你
              </span>
            ) : (
              <Avatar character={msg.speaker || { name: '?' }} className="mt-0.5 h-7 w-7" />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className={`truncate text-xs font-bold ${isUser ? 'text-desk-user-name' : 'text-desk-ai-name'}`}>{name}</span>
                <span className="shrink-0 text-[11px] text-desk-text-faint">{formatMessageTime(msg.created_at)}</span>
              </div>
              <div className={`mt-1 text-[15px] leading-[1.75] text-desk-text ${isGenerating ? '[&>p:last-of-type]:inline' : ''}`}>
                {isUser
                  ? msg.content && <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                  : msg.content && <ReactMarkdown components={markdownComponents}>{msg.content}</ReactMarkdown>}
                {isGenerating && (
                  <span aria-hidden="true" className="inline-block animate-cursor-blink text-desk-text">
                    ▍
                  </span>
                )}
                {msg.error && <p className="mt-1 text-xs text-desk-accent">{msg.error}</p>}
              </div>
            </div>
          </div>
        )
      })}
      <div ref={messagesEndRef} />
    </>
  )
}

function StatusBar({ lastStats, group, maxSpeakers }) {
  const parts = []
  if (lastStats) {
    parts.push(`本轮 ${lastStats.spoken}/${lastStats.total} 位发言`)
    parts.push(`共 ${formatSeconds(lastStats.totalMs)}`)
    if (lastStats.stopped) parts.push('已停止')
  } else if (group) {
    parts.push(`每轮最多 ${Math.min(group.members.length, maxSpeakers)} 位角色发言`)
  }
  return <p className="truncate px-5 pb-3 pt-2 text-[11px] text-desk-text-faint">{parts.join(' · ') || ' '}</p>
}

export default function GroupChatView({
  groups,
  groupsLoaded,
  config,
  characters,
  selectedGroup,
  messages,
  inputValue,
  isLoading,
  isStreaming,
  speakingId,
  allowEmoji,
  errors,
  lastStats,
  modal,
  isSidebarOpen,
  messagesEndRef,
  onSelectGroup,
  onOpenCreate,
  onOpenEdit,
  onCloseModal,
  onGroupSaved,
  onAllowEmojiChange,
  onInputChange,
  onKeyDown,
  onSendMessage,
  onStop,
  onClear,
  onLeave,
  onToggleSidebar,
  onCloseSidebar,
}) {
  const textareaRef = useRef(null)
  useLayoutEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = '88px'
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 88), 160)}px`
  }, [inputValue])

  const canSend = !isLoading && !!selectedGroup && selectedGroup.members.length > 0

  return (
    <div className="flex h-full bg-desk-panel text-desk-text">
      <GroupSidebar
        groups={groups}
        groupsLoaded={groupsLoaded}
        selectedGroup={selectedGroup}
        isOpen={isSidebarOpen}
        allowEmoji={allowEmoji}
        onSelectGroup={onSelectGroup}
        onOpenCreate={onOpenCreate}
        onOpenEdit={onOpenEdit}
        onAllowEmojiChange={onAllowEmojiChange}
        onClose={onCloseSidebar}
      />

      <section className="flex min-w-0 flex-1 flex-col">
        {/* 顶栏 56px：群头像（点击展开 / 收起群列表）+ 群名 + 成员头像横排 + 清 + 退出群聊 */}
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-desk-divider bg-desk-header px-2 sm:px-4">
          <button
            type="button"
            onClick={onToggleSidebar}
            className="shrink-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-desk-accent"
            aria-label={isSidebarOpen ? '收起群列表' : '展开群列表，切换群'}
            aria-expanded={isSidebarOpen}
            title="切换群"
          >
            <GroupBadge group={selectedGroup} />
          </button>
          <h1 className="ml-1 min-w-0 flex-1 truncate text-[17px] font-bold text-white">{selectedGroup?.name || '群聊'}</h1>
          {selectedGroup && <MemberAvatars members={selectedGroup.members} speakingId={speakingId} />}
          <IconButton label="清" title="清空群聊记录" onClick={onClear} disabled={!selectedGroup || isLoading} />
          <button
            type="button"
            onClick={onLeave}
            disabled={!selectedGroup}
            className="shrink-0 whitespace-nowrap rounded-btn px-1 py-1 text-[13px] font-semibold text-desk-accent transition-colors hover:text-desk-accent-hover disabled:cursor-not-allowed disabled:opacity-40 sm:px-1.5"
          >
            退出群聊
          </button>
        </header>

        {selectedGroup ? (
          <>
            <GroupBand group={selectedGroup} minMembers={config.min_members} />

            <div className="relative z-10 mx-3 -mt-3 min-h-0 flex-1 overflow-y-auto rounded-xl bg-desk-panel-soft px-4 py-4 [scrollbar-color:theme(colors.desk.divider)_transparent] [scrollbar-width:thin] sm:mx-4 sm:px-5">
              <GroupMessageList messages={messages} group={selectedGroup} isLoading={isLoading} messagesEndRef={messagesEndRef} />
            </div>
          </>
        ) : (
          <div className="flex min-h-0 flex-1 items-center justify-center px-6 text-center">
            {groupsLoaded && (
              <div>
                <p className="mb-1 text-base text-desk-text-dim">还没有群聊</p>
                <p className="mb-5 text-sm text-desk-text-faint">
                  拉 {config.min_members}~{config.max_members} 个角色进群，你说一句，它们按顺序轮流接话
                </p>
                <button
                  type="button"
                  onClick={onOpenCreate}
                  className="h-10 rounded-btn bg-desk-green px-6 text-sm font-bold text-desk-on-green transition-colors hover:bg-desk-green-hover"
                >
                  + 新建群聊
                </button>
              </div>
            )}
          </div>
        )}

        <div className="shrink-0 px-3 pt-3 sm:px-4">
          {errors.map((err) => (
            <p key={err} className="mb-2 text-xs text-desk-accent">
              {err}
            </p>
          ))}
          <div className="flex items-end gap-3">
            <textarea
              ref={textareaRef}
              value={inputValue}
              onChange={(e) => onInputChange(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={selectedGroup ? '对群里说点什么…（Enter 发送，Shift+Enter 换行）' : '先新建一个群'}
              disabled={!canSend}
              rows={3}
              className="h-[88px] max-h-[160px] min-w-0 flex-1 resize-none rounded-xl border border-transparent bg-desk-control px-4 py-3 text-[15px] leading-relaxed text-desk-text outline-none transition-colors placeholder:text-desk-text-faint focus:border-desk-accent disabled:cursor-not-allowed disabled:opacity-60"
            />
            <div className="flex shrink-0 flex-col gap-2">
              <button
                type="button"
                onClick={onSendMessage}
                disabled={!canSend}
                className="h-10 w-[92px] rounded-btn bg-desk-green text-sm font-bold text-desk-on-green transition-colors hover:bg-desk-green-hover disabled:cursor-not-allowed disabled:bg-desk-control disabled:text-desk-text-faint"
              >
                发送
              </button>
              <button
                type="button"
                onClick={onStop}
                disabled={!isStreaming}
                className="h-10 w-[92px] rounded-btn bg-desk-accent text-sm font-bold text-white transition-colors hover:bg-desk-accent-hover disabled:cursor-not-allowed disabled:bg-desk-control disabled:font-semibold disabled:text-desk-text-faint"
              >
                停止
              </button>
            </div>
          </div>
        </div>

        <StatusBar lastStats={lastStats} group={selectedGroup} maxSpeakers={config.max_speakers} />
      </section>

      {modal && (
        <GroupFormModal group={modal.group} characters={characters} config={config} onClose={onCloseModal} onSaved={onGroupSaved} />
      )}
    </div>
  )
}
