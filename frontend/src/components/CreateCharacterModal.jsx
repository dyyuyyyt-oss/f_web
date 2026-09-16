import { useState } from 'react'
import { createCharacter } from '../api/characters'
import AvatarPicker from './AvatarPicker'

// 创建角色弹窗
// onClose: 关闭弹窗回调
// onCreated: 创建成功回调，参数为新建的角色对象
export default function CreateCharacterModal({ onClose, onCreated }) {
  const [form, setForm] = useState({
    name: '',
    avatar: '',
    persona: '',
    greeting: '',
    scenario: '',
    example_dialogue: '',
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleChange = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!form.name.trim() || !form.persona.trim()) {
      setError('角色名称和人设描述为必填项')
      return
    }

    setIsSubmitting(true)
    try {
      // 可选字段为空字符串时不提交，交由后端使用默认值 None
      const payload = {
        name: form.name.trim(),
        persona: form.persona.trim(),
        avatar: form.avatar.trim() || null,
        greeting: form.greeting.trim() || null,
        scenario: form.scenario.trim() || null,
        example_dialogue: form.example_dialogue.trim() || null,
      }
      const newCharacter = await createCharacter(payload)
      onCreated(newCharacter)
    } catch (err) {
      setError(err.message || '创建角色失败')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-800">✨ 创建角色</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
            aria-label="关闭"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              角色名称 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={handleChange('name')}
              placeholder="例如：星野🌟"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">头像</label>
            <AvatarPicker
              previewUrl={form.avatar}
              onUploaded={(url) => setForm((prev) => ({ ...prev, avatar: url }))}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              人设描述 <span className="text-red-500">*</span>
            </label>
            <textarea
              value={form.persona}
              onChange={handleChange('persona')}
              placeholder="描述角色的性格、说话风格等"
              rows="3"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">欢迎语</label>
            <textarea
              value={form.greeting}
              onChange={handleChange('greeting')}
              placeholder="角色对用户说的第一句话"
              rows="2"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">场景设定</label>
            <textarea
              value={form.scenario}
              onChange={handleChange('scenario')}
              placeholder="对话发生的场景背景"
              rows="2"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">示例对话</label>
            <textarea
              value={form.example_dialogue}
              onChange={handleChange('example_dialogue')}
              placeholder="给出一段示例对话，帮助 AI 理解角色风格"
              rows="3"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm resize-none"
            />
          </div>

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
              type="submit"
              disabled={isSubmitting}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed text-sm font-medium"
            >
              {isSubmitting ? '创建中...' : '创建角色'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
