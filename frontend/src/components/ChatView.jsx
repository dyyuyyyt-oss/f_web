import ReactMarkdown from 'react-markdown'
import { resolveApiUrl } from '../api/config'
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

// 聊天界面的纯展示部分：不持有任何状态、不发请求，所有数据和事件处理都由 ChatInterface 通过 props 传入
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
}) {
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
            onChange={(e) => onSelectCharacter(Number(e.target.value))}
            className="flex-1 max-w-xs px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          >
            {characters.map((char) => (
              <option key={char.id} value={char.id}>
                {char.name}
              </option>
            ))}
          </select>
          <button
            onClick={onOpenEditAvatar}
            disabled={!selectedCharacter}
            className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            更换头像
          </button>
          <button
            onClick={onOpenEditCharacter}
            disabled={!selectedCharacter}
            className="px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="编辑角色"
            title="编辑角色"
          >
            ✏️ 编辑
          </button>
          <button
            onClick={onDeleteCharacter}
            disabled={!selectedCharacter}
            className="px-3 py-2 text-sm bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="删除角色"
            title="删除角色"
          >
            🗑️ 删除
          </button>
          <button
            onClick={onOpenCreateCharacter}
            className="px-4 py-2 text-sm bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors font-medium"
          >
            + 创建角色
          </button>
          <button
            onClick={onClearMessages}
            className="px-4 py-2 text-sm bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors"
          >
            清空对话
          </button>
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={allowEmoji}
              onChange={(e) => onAllowEmojiChange(e.target.checked)}
              className="w-4 h-4 accent-blue-600"
            />
            允许表情回复
          </label>
          <button
            onClick={onLogout}
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
                    onClick={onRegenerate}
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
                  onClick={onRemovePendingImage}
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
            onChange={onImageSelect}
            className="hidden"
          />
          <button
            type="button"
            onClick={onPickImage}
            disabled={isLoading || isUploadingImage || !selectedCharacterId}
            className="px-3 py-3 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed self-end"
            aria-label="添加图片"
          >
            🖼️
          </button>
          <textarea
            value={inputValue}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="输入你的问题...（Shift+Enter 换行, Enter 发送）"
            disabled={isLoading || !selectedCharacterId}
            className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none disabled:bg-gray-100 disabled:cursor-not-allowed"
            rows="3"
          />
          <button
            onClick={onSendMessage}
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
          onClose={onCloseCharacterModal}
          onSaved={onCharacterSaved}
        />
      )}

      {isEditAvatarModalOpen && selectedCharacter && (
        <EditAvatarModal
          character={selectedCharacter}
          onClose={onCloseEditAvatar}
          onUpdated={onAvatarUpdated}
        />
      )}
    </div>
  )
}
