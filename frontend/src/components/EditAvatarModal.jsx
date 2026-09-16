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
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-800">更换头像 · {character.name}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
            aria-label="关闭"
          >
            ×
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          <AvatarPicker previewUrl={avatar} onUploaded={setAvatar} />

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || !avatar || avatar === character.avatar}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed text-sm font-medium"
            >
              {isSaving ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
