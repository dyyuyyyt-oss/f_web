import { useState } from 'react'
import AvatarPicker from './AvatarPicker'
import { updateCharacterAvatar } from '../api/characters'

// 更换已有角色头像的弹窗
// character: 当前要更换头像的角色对象
// onClose: 关闭弹窗回调
// onUpdated: 更新成功回调，参数为更新后的角色对象
export default function EditAvatarModal({ character, onClose, onUpdated }) {
  const [avatar, setAvatar] = useState(character.avatar || '')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async () => {
    if (!avatar) {
      setError('请先选择一张图片')
      return
    }

    setError('')
    setIsSaving(true)
    try {
      const updated = await updateCharacterAvatar(character.id, avatar)
      onUpdated(updated)
    } catch (err) {
      setError(err.message || '更新头像失败')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
      <div className="bg-desk-panel border border-desk-divider rounded-2xl shadow-2xl w-full max-w-sm font-desk">
        <div className="flex items-center justify-between px-6 py-4 border-b border-desk-divider bg-desk-header rounded-t-2xl">
          <h2 className="text-[17px] font-bold text-white">更换头像 · {character.name}</h2>
          <button
            onClick={onClose}
            className="text-desk-text-dim hover:text-desk-text text-xl leading-none"
            aria-label="关闭"
          >
            ×
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          <AvatarPicker previewUrl={avatar} onUploaded={setAvatar} />

          {error && (
            <p className="text-sm text-desk-accent bg-desk-accent/10 border border-desk-accent/30 rounded-xl px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-10 px-4 rounded-btn bg-desk-control text-desk-text hover:bg-desk-control-hover transition-colors text-sm font-semibold"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || !avatar || avatar === character.avatar}
              className="flex-1 h-10 px-4 rounded-btn bg-desk-green text-desk-on-green font-bold hover:bg-desk-green-hover transition-colors disabled:bg-desk-control disabled:text-desk-text-faint disabled:cursor-not-allowed text-sm"
            >
              {isSaving ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
