import { useState } from 'react'
import { createCharacter, updateCharacter } from '../api/characters'
import AvatarPicker from './AvatarPicker'

// 创建/编辑角色弹窗（同一个组件复用：传入 character 就是编辑模式，否则是创建模式）
// character: 要编辑的角色对象，为空则是创建新角色
// onClose: 关闭弹窗回调
// onSaved: 创建/编辑成功回调，参数为保存后的角色对象
export default function CreateCharacterModal({ character = null, onClose, onSaved }) {
  const isEditing = Boolean(character)
  const [form, setForm] = useState({
    name: character?.name || '',
    avatar: character?.avatar || '',
    persona: character?.persona || '',
    greeting: character?.greeting || '',
    scenario: character?.scenario || '',
    example_dialogue: character?.example_dialogue || '',
    speaking_style: character?.speaking_style || '',
    catchphrase: character?.catchphrase || '',
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
      // 可选字段为空字符串时不提交，交由后端使用默认值 None（编辑模式下会清空该字段原有的值）
      const payload = {
        name: form.name.trim(),
        persona: form.persona.trim(),
        avatar: form.avatar.trim() || null,
        greeting: form.greeting.trim() || null,
        scenario: form.scenario.trim() || null,
        example_dialogue: form.example_dialogue.trim() || null,
        speaking_style: form.speaking_style.trim() || null,
        catchphrase: form.catchphrase.trim() || null,
      }
      const savedCharacter = isEditing
        ? await updateCharacter(character.id, payload)
        : await createCharacter(payload)
      onSaved(savedCharacter)
    } catch (err) {
      setError(err.message || (isEditing ? '编辑角色失败' : '创建角色失败'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
      <div className="bg-desk-panel border border-desk-divider rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto font-desk">
        <div className="flex items-center justify-between px-6 py-4 border-b border-desk-divider bg-desk-header rounded-t-2xl">
          <h2 className="text-[17px] font-bold text-white">
            {isEditing ? '✏️ 编辑角色' : '✨ 创建角色'}
          </h2>
          <button
            onClick={onClose}
            className="text-desk-text-dim hover:text-desk-text text-xl leading-none"
            aria-label="关闭"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-desk-text-dim mb-1">
              角色名称 <span className="text-desk-accent">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={handleChange('name')}
              placeholder="例如：星野🌟"
              className="w-full px-3 py-2 rounded-xl border border-transparent bg-desk-control text-desk-text placeholder:text-desk-text-faint focus:border-desk-accent outline-none text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-desk-text-dim mb-1">头像</label>
            <AvatarPicker
              previewUrl={form.avatar}
              onUploaded={(url) => setForm((prev) => ({ ...prev, avatar: url }))}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-desk-text-dim mb-1">
              人设描述 <span className="text-desk-accent">*</span>
            </label>
            <textarea
              value={form.persona}
              onChange={handleChange('persona')}
              placeholder="描述角色的性格、说话风格等"
              rows="3"
              className="w-full px-3 py-2 rounded-xl border border-transparent bg-desk-control text-desk-text placeholder:text-desk-text-faint focus:border-desk-accent outline-none text-sm resize-none"
            />
            <p className="text-xs text-desk-text-faint mt-1">
              越详细，AI 回复越贴近角色。建议描述性格、背景故事、说话习惯。
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-desk-text-dim mb-1">说话风格</label>
            <input
              type="text"
              value={form.speaking_style}
              onChange={handleChange('speaking_style')}
              placeholder="例如：温柔、爱撒娇、说话简短有力"
              className="w-full px-3 py-2 rounded-xl border border-transparent bg-desk-control text-desk-text placeholder:text-desk-text-faint focus:border-desk-accent outline-none text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-desk-text-dim mb-1">口头禅</label>
            <input
              type="text"
              value={form.catchphrase}
              onChange={handleChange('catchphrase')}
              placeholder="例如：哼、才不是呢、喵~"
              className="w-full px-3 py-2 rounded-xl border border-transparent bg-desk-control text-desk-text placeholder:text-desk-text-faint focus:border-desk-accent outline-none text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-desk-text-dim mb-1">欢迎语</label>
            <textarea
              value={form.greeting}
              onChange={handleChange('greeting')}
              placeholder="角色对用户说的第一句话"
              rows="2"
              className="w-full px-3 py-2 rounded-xl border border-transparent bg-desk-control text-desk-text placeholder:text-desk-text-faint focus:border-desk-accent outline-none text-sm resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-desk-text-dim mb-1">场景设定</label>
            <textarea
              value={form.scenario}
              onChange={handleChange('scenario')}
              placeholder="对话发生的场景背景"
              rows="2"
              className="w-full px-3 py-2 rounded-xl border border-transparent bg-desk-control text-desk-text placeholder:text-desk-text-faint focus:border-desk-accent outline-none text-sm resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-desk-text-dim mb-1">示例对话</label>
            <textarea
              value={form.example_dialogue}
              onChange={handleChange('example_dialogue')}
              placeholder="给出一段示例对话，帮助 AI 理解角色风格"
              rows="3"
              className="w-full px-3 py-2 rounded-xl border border-transparent bg-desk-control text-desk-text placeholder:text-desk-text-faint focus:border-desk-accent outline-none text-sm resize-none"
            />
          </div>

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
              type="submit"
              disabled={isSubmitting}
              className="flex-1 h-10 px-4 rounded-btn bg-desk-green text-desk-on-green font-bold hover:bg-desk-green-hover transition-colors disabled:bg-desk-control disabled:text-desk-text-faint disabled:cursor-not-allowed text-sm"
            >
              {isSubmitting ? (isEditing ? '保存中...' : '创建中...') : isEditing ? '保存修改' : '创建角色'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
