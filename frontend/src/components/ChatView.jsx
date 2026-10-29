import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import { resolveApiUrl } from '../api/config'
import { resolveBanner } from '../config/banners'
import { formatMessageTime, formatSeconds } from '../utils/chatFormat'
import CreateCharacterModal from './CreateCharacterModal'
import EditAvatarModal from './EditAvatarModal'

// 聊天界面的纯展示部分（桌面版暗色视觉）：所有数据和事件处理都由 ChatInterface 通过 props 传入，
// 这里不发请求、不持有业务状态。只有两处纯界面的小状态：立绘是否加载成功、输入框高度自适应

// AI 消息的 Markdown 暗色样式：*星号* 包裹的动作 / 心理描写显示成暗色斜体，增强沉浸感
const markdownComponents = {
  p: ({ children }) => <p className="mb-2 whitespace-pre-wrap break-words last:mb-0">{children}</p>,
  em: ({ children }) => <em className="italic text-desk-text-dim">{children}</em>,
  strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
  // 行内代码；代码块里的 code 会被下面 pre 的样式重置掉背景和内边距
  code: ({ children }) => (
    <code className="rounded-md bg-desk-code-bg px-1.5 py-0.5 font-mono text-[13px] text-desk-code-text">{children}</code>
  ),
  pre: ({ children }) => (
    <pre className="my-2 overflow-x-auto rounded-code bg-desk-code-bg p-3 font-mono text-[13px] leading-relaxed text-desk-code-text [&_code]:bg-transparent [&_code]:p-0">
      {children}
    </pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-desk-divider pl-3 text-desk-text-dim">{children}</blockquote>
  ),
  ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>,
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-desk-ai-name underline underline-offset-2">
      {children}
    </a>
  ),
  h1: ({ children }) => <p className="mb-2 font-bold text-white">{children}</p>,
  h2: ({ children }) => <p className="mb-2 font-bold text-white">{children}</p>,
  h3: ({ children }) => <p className="mb-2 font-bold text-white">{children}</p>,
}

// 顶栏 30×30 的单字按钮（不用 emoji：Windows 下会渲染成单色方块）
function IconButton({ label, title, onClick, disabled, active }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      aria-pressed={active}
      className={`flex h-[30px] min-w-[30px] shrink-0 items-center justify-center rounded-btn px-1.5 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        active
          ? 'bg-desk-accent text-white hover:bg-desk-accent-hover'
          : 'bg-desk-control text-desk-text hover:bg-desk-control-hover disabled:hover:bg-desk-control'
      }`}
    >
      {label}
    </button>
  )
}

function Avatar({ character, className = 'h-9 w-9' }) {
  return (
    <span className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-desk-control ring-1 ring-desk-divider ${className}`}>
      {character?.avatar ? (
        <img src={resolveApiUrl(character.avatar)} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="text-sm font-bold text-desk-text-dim">{character?.name?.slice(0, 1) || '?'}</span>
      )}
    </span>
  )
}

// 人物立绘：高 196px（窄屏 120px），底部 45% 渐变淡出到面板色；
// 图片加载成功才叠上去，失败或没有配置就只显示默认背景
function Banner({ character }) {
  const banner = resolveBanner(character)
  const [loadedSrc, setLoadedSrc] = useState(null)

  useEffect(() => {
    if (!banner?.src) return
    let cancelled = false
    const img = new Image()
    img.onload = () => !cancelled && setLoadedSrc(banner.src)
    img.src = resolveApiUrl(banner.src)
    return () => {
      cancelled = true
    }
  }, [banner?.src])

  const showImage = banner?.src && loadedSrc === banner.src
  // 配了 faceY 时按容器宽度对准脸部：眼睛放在横幅高度约 57% 处（和桌面版截图一致）；没配就用桌面版的 center 8%
  const position = banner?.faceY != null ? `center calc(var(--face-at) - ${banner.faceY * 100}cqw)` : 'center 8%'

  return (
    <div className="relative h-[120px] shrink-0 overflow-hidden bg-desk-banner [--face-at:68px] [container-type:inline-size] sm:h-[196px] sm:[--face-at:112px]">
      <div
        className={`absolute inset-0 bg-cover bg-no-repeat transition-opacity duration-500 ${showImage ? 'opacity-100' : 'opacity-0'}`}
        style={showImage ? { backgroundImage: `url(${resolveApiUrl(banner.src)})`, backgroundPosition: position } : undefined}
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[45%] bg-gradient-to-b from-transparent to-desk-panel" />
    </div>
  )
}

function CharacterSidebar({
  characters,
  selectedCharacter,
  isOpen,
  allowEmoji,
  onSelectCharacter,
  onOpenEditAvatar,
  onOpenEditCharacter,
  onDeleteCharacter,
  onOpenCreateCharacter,
  onAllowEmojiChange,
  onClose,
}) {
  return (
    <>
      {/* 窄屏：抽屉 + 遮罩；宽屏：常驻左侧，可收起 */}
      {isOpen && <div className="fixed inset-0 z-30 bg-black/50 md:hidden" onClick={onClose} aria-hidden="true" />}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-desk-divider bg-desk-panel transition-transform duration-200 md:static md:z-auto md:transition-none ${
          isOpen ? 'translate-x-0' : 'invisible -translate-x-full md:hidden'
        }`}
        aria-label="角色列表"
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-desk-divider bg-desk-header px-4">
          <Link to="/" className="text-sm font-semibold text-desk-text-dim transition-colors hover:text-desk-text">
            ‹ 功能大厅
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="flex h-[30px] w-[30px] items-center justify-center rounded-btn text-desk-text-dim transition-colors hover:bg-desk-control hover:text-desk-text"
            aria-label="收起角色栏"
            title="收起角色栏"
          >
            ×
          </button>
        </div>

        <p className="px-4 pb-2 pt-4 text-xs font-semibold text-desk-text-faint">选择角色</p>
        <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-2">
          {characters.map((char) => {
            const selected = char.id === selectedCharacter?.id
            return (
              <li key={char.id}>
                <button
                  type="button"
                  onClick={() => onSelectCharacter(char.id)}
                  aria-current={selected ? 'true' : undefined}
                  className={`flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors ${
                    selected ? 'bg-desk-header' : 'hover:bg-desk-control'
                  }`}
                >
                  <Avatar character={char} />
                  <span className={`min-w-0 flex-1 truncate text-sm font-semibold ${selected ? 'text-white' : 'text-desk-text-dim'}`}>
                    {char.name}
                  </span>
                </button>
                {selected && (
                  <div className="flex gap-1 px-2 pb-1 pt-1.5 pl-[56px]">
                    <button type="button" onClick={onOpenEditAvatar} className="rounded-md px-2 py-1 text-xs text-desk-text-dim transition-colors hover:bg-desk-control hover:text-desk-text">
                      换头像
                    </button>
                    <button type="button" onClick={onOpenEditCharacter} className="rounded-md px-2 py-1 text-xs text-desk-text-dim transition-colors hover:bg-desk-control hover:text-desk-text">
                      编辑
                    </button>
                    <button type="button" onClick={onDeleteCharacter} className="rounded-md px-2 py-1 text-xs text-desk-accent transition-colors hover:bg-desk-control hover:text-desk-accent-hover">
                      删除
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
            <input
              type="checkbox"
              checked={allowEmoji}
              onChange={(e) => onAllowEmojiChange(e.target.checked)}
              className="peer sr-only"
            />
            <span className="relative h-5 w-9 rounded-full bg-desk-control transition-colors peer-checked:bg-desk-green peer-focus-visible:ring-2 peer-focus-visible:ring-desk-accent after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-4" />
          </label>
          <button
            type="button"
            onClick={onOpenCreateCharacter}
            className="h-10 w-full rounded-btn bg-desk-green text-sm font-bold text-desk-on-green transition-colors hover:bg-desk-green-hover"
          >
            + 新建角色
          </button>
        </div>
      </aside>
    </>
  )
}

function MessageList({ messages, selectedCharacter, isLoading, messagesEndRef }) {
  if (messages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-center text-sm text-desk-text-faint">
        <div>
          <p className="mb-1 text-base text-desk-text-dim">开始聊天吧</p>
          <p>在下面输入消息，或点「图」附带一张图片</p>
        </div>
      </div>
    )
  }

  const aiName = selectedCharacter?.name || 'AI'
  return (
    <>
      {messages.map((msg, idx) => {
        const isUser = msg.role === 'user'
        // 正在生成的那条：最后一条 AI 消息且仍在加载中，末尾显示闪烁光标
        const isGenerating = !isUser && isLoading && idx === messages.length - 1
        return (
          <div key={idx} className="mb-[18px] last:mb-0">
            <div className="flex items-baseline gap-2">
              <span className={`text-xs font-bold ${isUser ? 'text-desk-user-name' : 'text-desk-ai-name'}`}>
                {isUser ? '你' : aiName}
              </span>
              <span className="text-[11px] text-desk-text-faint">{formatMessageTime(msg.created_at)}</span>
            </div>
            {/* 生成中让最后一个段落变成行内，光标紧跟在文字末尾（和桌面版一致），而不是掉到下一行 */}
            <div className={`mt-1 text-[15px] leading-[1.75] text-desk-text ${isGenerating ? '[&>p:last-of-type]:inline' : ''}`}>
              {msg.image_url && (
                <img src={msg.image_url} alt="用户发送的图片" className="mb-2 max-h-60 max-w-[240px] rounded-xl object-cover" />
              )}
              {isUser ? (
                msg.content && <p className="whitespace-pre-wrap break-words">{msg.content}</p>
              ) : (
                msg.content && <ReactMarkdown components={markdownComponents}>{msg.content}</ReactMarkdown>
              )}
              {/* 早期流式回复落库为空的遗留数据：给个说明，免得看起来像界面坏了 */}
              {!isUser && !msg.content && !msg.image_url && !isGenerating && (
                <p className="text-sm text-desk-text-faint">（这条回复当时没有保存下来）</p>
              )}
              {isGenerating && (
                <span aria-hidden="true" className="inline-block animate-cursor-blink text-desk-text">
                  ▍
                </span>
              )}
            </div>
          </div>
        )
      })}
      <div ref={messagesEndRef} />
    </>
  )
}

function StatusBar({ lastStats, thinking }) {
  const parts = []
  if (lastStats) {
    if (lastStats.firstTokenMs != null) parts.push(`首字 ${formatSeconds(lastStats.firstTokenMs)}`)
    parts.push(`共 ${formatSeconds(lastStats.totalMs)}`)
    parts.push(`${lastStats.chars} 字`)
    if (lastStats.stopped) parts.push('已停止')
  }
  parts.push(thinking ? '思考开' : '思考关')
  return <p className="truncate px-5 pb-3 pt-2 text-[11px] text-desk-text-faint">{parts.join(' · ')}</p>
}

export default function ChatView({
  characters,
  selectedCharacter,
  selectedCharacterId,
  messages,
  isLoading,
  inputValue,
  allowEmoji,
  pendingImage,
  isUploadingImage,
  imageUploadError,
  clearError,
  continueError,
  deleteError,
  isCharacterModalOpen,
  editingCharacter,
  isEditAvatarModalOpen,
  messagesEndRef,
  fileInputRef,
  onSelectCharacter,
  onOpenEditAvatar,
  onOpenEditCharacter,
  onDeleteCharacter,
  onOpenCreateCharacter,
  onClearMessages,
  onAllowEmojiChange,
  onLogout,
  onRegenerate,
  onInputChange,
  onKeyDown,
  onSendMessage,
  onImageSelect,
  onPickImage,
  onRemovePendingImage,
  onCloseCharacterModal,
  onCharacterSaved,
  onCloseEditAvatar,
  onAvatarUpdated,
  thinking,
  onToggleThinking,
  isStreaming,
  onStop,
  canRegenerate,
  canContinue,
  onContinue,
  onExport,
  lastStats,
  isSidebarOpen,
  onToggleSidebar,
  onCloseSidebar,
}) {
  // 输入框高度随内容自适应：88px 起，最高 160px，超出后内部滚动
  const textareaRef = useRef(null)
  useLayoutEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = '88px'
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 88), 160)}px`
  }, [inputValue])

  // 发送按钮只在生成中变灰禁用（和桌面版一致）；输入为空时点击由 ChatInterface 里原有的判断忽略
  const canSend = !isLoading && !!selectedCharacterId
  const errors = [clearError, continueError, deleteError, imageUploadError].filter(Boolean)

  return (
    <div className="flex h-full bg-desk-panel text-desk-text">
      <CharacterSidebar
        characters={characters}
        selectedCharacter={selectedCharacter}
        isOpen={isSidebarOpen}
        allowEmoji={allowEmoji}
        onSelectCharacter={onSelectCharacter}
        onOpenEditAvatar={onOpenEditAvatar}
        onOpenEditCharacter={onOpenEditCharacter}
        onDeleteCharacter={onDeleteCharacter}
        onOpenCreateCharacter={onOpenCreateCharacter}
        onAllowEmojiChange={onAllowEmojiChange}
        onClose={onCloseSidebar}
      />

      <section className="flex min-w-0 flex-1 flex-col">
        {/* 顶栏 56px：头像（点击展开 / 收起角色栏）+ 角色名 + 单字按钮 + 退出 */}
        <header className="flex h-14 shrink-0 items-center gap-1 border-b border-desk-divider bg-desk-header px-2 sm:gap-2 sm:px-4">
          <button
            type="button"
            onClick={onToggleSidebar}
            className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-desk-accent"
            aria-label={isSidebarOpen ? '收起角色栏' : '展开角色栏，切换角色'}
            aria-expanded={isSidebarOpen}
            title="切换角色"
          >
            <Avatar character={selectedCharacter} />
          </button>
          <h1 className="ml-1 min-w-0 flex-1 truncate text-[17px] font-bold text-white">
            {selectedCharacter?.name || '选择角色'}
          </h1>

          <IconButton label="思考" title={thinking ? '深度思考：开（点击关闭）' : '深度思考：关（点击开启）'} onClick={onToggleThinking} active={thinking} />
          <IconButton label="图" title="发送图片" onClick={onPickImage} disabled={isLoading || isUploadingImage || !selectedCharacterId} />
          <IconButton label="再" title="重新生成上一条回复" onClick={onRegenerate} disabled={!canRegenerate} />
          <IconButton label="续" title="接着上一条回复继续写" onClick={onContinue} disabled={!canContinue} />
          <IconButton label="存" title="导出为 Markdown" onClick={onExport} disabled={messages.length === 0} />
          <IconButton label="清" title="清空对话" onClick={onClearMessages} disabled={isLoading} />
          <button
            type="button"
            onClick={onLogout}
            className="shrink-0 rounded-btn px-1 py-1 text-[13px] font-semibold text-desk-accent transition-colors hover:text-desk-accent-hover sm:ml-1 sm:px-1.5"
          >
            退出
          </button>
        </header>

        <Banner character={selectedCharacter} />

        {/* 消息区：内容块圆角 12px，底色 --panel-soft */}
        <div className="relative z-10 mx-3 -mt-3 min-h-0 flex-1 overflow-y-auto rounded-xl bg-desk-panel-soft px-5 py-4 [scrollbar-color:theme(colors.desk.divider)_transparent] [scrollbar-width:thin] sm:mx-4">
          <MessageList
            messages={messages}
            selectedCharacter={selectedCharacter}
            isLoading={isLoading}
            messagesEndRef={messagesEndRef}
          />
        </div>

        {/* 输入区 */}
        <div className="shrink-0 px-3 pt-3 sm:px-4">
          {errors.map((err) => (
            <p key={err} className="mb-2 text-xs text-desk-accent">
              {err}
            </p>
          ))}
          {(pendingImage || isUploadingImage) && (
            <div className="mb-2">
              {isUploadingImage ? (
                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-desk-control text-[11px] text-desk-text-faint">
                  上传中…
                </div>
              ) : (
                <div className="relative h-14 w-14">
                  <img
                    src={resolveApiUrl(pendingImage.url)}
                    alt="待发送图片"
                    className="h-14 w-14 rounded-xl object-cover ring-1 ring-desk-divider"
                  />
                  <button
                    type="button"
                    onClick={onRemovePendingImage}
                    className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-desk-accent text-xs text-white hover:bg-desk-accent-hover"
                    aria-label="移除图片"
                  >
                    ×
                  </button>
                </div>
              )}
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={onImageSelect}
            className="hidden"
          />
          <div className="flex items-end gap-3">
            <textarea
              ref={textareaRef}
              value={inputValue}
              onChange={(e) => onInputChange(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="输入消息…（Enter 发送，Shift+Enter 换行）"
              disabled={isLoading || !selectedCharacterId}
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

        <StatusBar lastStats={lastStats} thinking={thinking} />
      </section>

      {isCharacterModalOpen && (
        <CreateCharacterModal character={editingCharacter} onClose={onCloseCharacterModal} onSaved={onCharacterSaved} />
      )}

      {isEditAvatarModalOpen && selectedCharacter && (
        <EditAvatarModal character={selectedCharacter} onClose={onCloseEditAvatar} onUpdated={onAvatarUpdated} />
      )}
    </div>
  )
}
