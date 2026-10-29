import { useState } from 'react'
import { createGroup, updateGroup } from '../api/groups'
import { Avatar } from './ChatView'

// 新建 / 编辑群弹窗（传入 group 就是编辑模式）
// - 勾选角色：勾选的先后就是默认发言顺序，数量受 /api/groups/config 的上下限约束
// - 发言顺序：可以拖动排序，也可以点 ↑ ↓（手机上拖动不方便）
// group: 要编辑的群，为空则是新建
// characters: 全部可选角色
// config: { min_members, max_members }
// onSaved: 保存成功回调，参数为后端返回的群
export default function GroupFormModal({ group = null, characters, config, onClose, onSaved }) {
  const isEditing = Boolean(group)
  const { min_members: minMembers, max_members: maxMembers } = config
  const [name, setName] = useState(group?.name || '')
  // 已选角色 ID，按发言顺序排列
  const [order, setOrder] = useState(() => (group ? group.members.map((m) => m.character_id) : []))
  const [dragIndex, setDragIndex] = useState(null)
  const [overIndex, setOverIndex] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  const byId = new Map(characters.map((c) => [c.id, c]))
  // 编辑时成员可能已经不在角色列表里（被删除），这里只保留还存在的
  const selected = order.filter((id) => byId.has(id))
  const isFull = selected.length >= maxMembers
  const tooFew = selected.length < minMembers
  const defaultName = selected.map((id) => byId.get(id).name).join('、')

  const toggle = (id) => {
    setError('')
    setOrder((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= maxMembers ? prev : [...prev, id]))
  }

  const move = (from, to) => {
    if (to < 0 || to >= selected.length || from === to) return
    setOrder(() => {
      const next = [...selected]
      const [item] = next.splice(from, 1)
      next.splice(to, 0, item)
      return next
    })
  }

  const handleDrop = (to) => {
    if (dragIndex !== null) move(dragIndex, to)
    setDragIndex(null)
    setOverIndex(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (tooFew) {
      setError(`至少 ${minMembers} 个角色才能组群`)
      return
    }
    // 不填群名就用成员名拼一个
    const finalName = (name.trim() || defaultName).slice(0, 255)
    setIsSubmitting(true)
    setError('')
    try {
      const saved = isEditing
        ? await updateGroup(group.id, { name: finalName, characterIds: selected })
        : await createGroup(finalName, selected)
      onSaved(saved)
    } catch (err) {
      setError(err.message || (isEditing ? '保存失败' : '建群失败'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" role="dialog" aria-modal="true" aria-labelledby="group-form-title">
      <div className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-desk-divider bg-desk-panel font-desk shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-desk-divider bg-desk-header px-6 py-4">
          <h2 id="group-form-title" className="text-[17px] font-bold text-white">
            {isEditing ? '编辑群' : '新建群聊'}
          </h2>
          <button type="button" onClick={onClose} className="text-xl leading-none text-desk-text-dim hover:text-desk-text" aria-label="关闭">
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-4">
            <div>
              <label htmlFor="group-name" className="mb-1 block text-sm font-medium text-desk-text-dim">
                群名
              </label>
              <input
                id="group-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={255}
                placeholder={defaultName ? `不填就叫「${defaultName}」` : '比如：下午茶小队'}
                className="w-full rounded-xl border border-transparent bg-desk-control px-3 py-2 text-[15px] text-desk-text outline-none transition-colors placeholder:text-desk-text-faint focus:border-desk-accent"
              />
            </div>

            <fieldset>
              <legend className="mb-1 flex w-full items-baseline justify-between text-sm font-medium text-desk-text-dim">
                <span>选择角色</span>
                <span className={`text-xs ${tooFew ? 'text-desk-accent' : 'text-desk-text-faint'}`}>
                  已选 {selected.length} / {maxMembers}
                  {tooFew ? ` · 至少 ${minMembers} 个` : ''}
                </span>
              </legend>
              {characters.length === 0 ? (
                <p className="rounded-xl bg-desk-panel-soft px-3 py-4 text-center text-sm text-desk-text-faint">还没有角色，先去「AI 对话」里创建几个吧</p>
              ) : (
                <ul className="space-y-1">
                  {characters.map((c) => {
                    const checked = selected.includes(c.id)
                    const disabled = !checked && isFull
                    return (
                      <li key={c.id}>
                        <label
                          className={`flex items-center gap-3 rounded-xl px-2 py-1.5 transition-colors ${
                            disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer hover:bg-desk-control'
                          }`}
                          title={disabled ? `一个群最多 ${maxMembers} 个角色` : undefined}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={disabled}
                            onChange={() => toggle(c.id)}
                            className="h-4 w-4 shrink-0 accent-desk-green"
                          />
                          <Avatar character={c} className="h-8 w-8" />
                          <span className="min-w-0 flex-1 truncate text-sm text-desk-text">{c.name}</span>
                        </label>
                      </li>
                    )
                  })}
                </ul>
              )}
            </fieldset>

            {selected.length > 0 && (
              <div>
                <p className="mb-1 text-sm font-medium text-desk-text-dim">
                  发言顺序 <span className="text-xs font-normal text-desk-text-faint">（拖动或点 ↑ ↓ 调整）</span>
                </p>
                <ol className="space-y-1" aria-label="发言顺序">
                  {selected.map((id, index) => {
                    const c = byId.get(id)
                    return (
                      <li
                        key={id}
                        draggable
                        onDragStart={(e) => {
                          setDragIndex(index)
                          e.dataTransfer.effectAllowed = 'move'
                          e.dataTransfer.setData('text/plain', String(id))
                        }}
                        onDragOver={(e) => {
                          e.preventDefault()
                          if (overIndex !== index) setOverIndex(index)
                        }}
                        onDragLeave={() => setOverIndex((cur) => (cur === index ? null : cur))}
                        onDrop={(e) => {
                          e.preventDefault()
                          handleDrop(index)
                        }}
                        onDragEnd={() => {
                          setDragIndex(null)
                          setOverIndex(null)
                        }}
                        data-character-id={id}
                        className={`flex cursor-grab items-center gap-2 rounded-xl border bg-desk-panel-soft px-2 py-1.5 active:cursor-grabbing ${
                          overIndex === index && dragIndex !== index ? 'border-desk-green' : 'border-transparent'
                        } ${dragIndex === index ? 'opacity-50' : ''}`}
                      >
                        <span aria-hidden="true" className="select-none px-0.5 text-desk-text-faint">
                          ⋮⋮
                        </span>
                        <span className="w-4 shrink-0 text-center text-xs font-bold text-desk-text-faint">{index + 1}</span>
                        <Avatar character={c} className="h-7 w-7" />
                        <span className="min-w-0 flex-1 truncate text-sm text-desk-text">{c.name}</span>
                        <button
                          type="button"
                          onClick={() => move(index, index - 1)}
                          disabled={index === 0}
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-btn text-desk-text-dim transition-colors hover:bg-desk-control hover:text-desk-text disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
                          aria-label={`${c.name} 往前挪`}
                          title="往前挪"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => move(index, index + 1)}
                          disabled={index === selected.length - 1}
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-btn text-desk-text-dim transition-colors hover:bg-desk-control hover:text-desk-text disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
                          aria-label={`${c.name} 往后挪`}
                          title="往后挪"
                        >
                          ↓
                        </button>
                      </li>
                    )
                  })}
                </ol>
              </div>
            )}
          </div>

          <div className="shrink-0 border-t border-desk-divider px-6 py-4">
            {error && <p className="mb-3 text-sm text-desk-accent">{error}</p>}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="h-10 flex-1 rounded-btn bg-desk-control text-sm font-semibold text-desk-text transition-colors hover:bg-desk-control-hover"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="h-10 flex-1 rounded-btn bg-desk-green text-sm font-bold text-desk-on-green transition-colors hover:bg-desk-green-hover disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? '保存中…' : isEditing ? '保存' : '建群'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
