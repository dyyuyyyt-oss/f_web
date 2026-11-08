import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listRoles, createRole, bulkDelete, getDevice } from '../api/aibox'
import './aibox.css'

const AVATAR_CHOICES = ['◉', '🎭', '🐋', '🌊', '🔮', '🌙', '⚙️', '🕯️', '🎧', '🧿']
const COLOR_CHOICES = ['#5ec8f2', '#a98bf0', '#f6c04a', '#f2695c', '#6fe0a0', '#c9d4ea']

export default function AiBoxPage() {
  const [roles, setRoles] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [manage, setManage] = useState(false)
  const [selected, setSelected] = useState([])
  const [showNew, setShowNew] = useState(false)
  const [draft, setDraft] = useState({ name: '', subtitle: '', avatar: '◉', color: '#5ec8f2' })
  const [busy, setBusy] = useState(false)
  const [device, setDevice] = useState(null)
  const navigate = useNavigate()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const list = await listRoles()
      setRoles(list)
      setErr('')
    } catch (e) {
      setErr(e.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    let alive = true
    const tick = async () => {
      try {
        const d = await getDevice()
        if (alive) setDevice(d)
      } catch (e) { /* 后端没起来时静默 */ }
    }
    tick()
    const t = setInterval(tick, 10000)
    return () => { alive = false; clearInterval(t) }
  }, [])

  const toggle = (id) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const onCard = (role) => {
    if (manage) toggle(role.id)
    else navigate(`/aibox/${role.id}`)
  }

  const exitManage = () => { setManage(false); setSelected([]) }

  const doBulkDelete = async () => {
    if (!selected.length) return
    if (!window.confirm(`确定删除选中的 ${selected.length} 个角色？此操作不可撤销。`)) return
    setBusy(true)
    try {
      await bulkDelete(selected)
      setSelected([])
      setManage(false)
      await load()
    } catch (e) {
      setErr(e.message || '删除失败')
    } finally {
      setBusy(false)
    }
  }

  const doCreate = async () => {
    const name = draft.name.trim()
    if (!name) return
    setBusy(true)
    try {
      const res = await createRole({ ...draft, name })
      setShowNew(false)
      setDraft({ name: '', subtitle: '', avatar: '◉', color: '#5ec8f2' })
      if (res && res.id) navigate(`/aibox/${res.id}`)
      else await load()
    } catch (e) {
      setErr(e.message || '创建失败')
    } finally {
      setBusy(false)
    }
  }

  const ds = (device && device.status) || {}
  const online = !!ds.online
  const battery = ds.battery
  const batteryText = (battery === null || battery === undefined)
    ? 'USB 供电（本板无电池）'
    : `${battery}%`
  const rssi = ds.rssi
  const sigText = (rssi === null || rssi === undefined) ? '—' : `${rssi} dBm`
  const noteText = ds.note || (device ? '等待汇报' : '未连接控制面')

  return (
    <div className="ab-root">
      <header className="ab-header">
        <span className="dot" /> AI BOX
        <span className="sub">角色盒子</span>
        <span className="spacer" />
        <button className="ab-back" onClick={() => navigate('/')}>← 返回大厅</button>
      </header>

      <main className="ab-main">
        <div className="ab-toolbar">
          <div>
            <div className="title">全部角色</div>
            <div className="count">{roles.length} 个角色{manage ? ` · 已选 ${selected.length}` : ''}</div>
          </div>
          <span className="spacer" />
          {manage ? (
            <button className="ab-btn ghost" onClick={exitManage}>取消管理</button>
          ) : (
            <button className="ab-btn" onClick={() => setManage(true)} disabled={!roles.length}>管理</button>
          )}
          <button className="ab-btn primary" onClick={() => setShowNew(true)}>+ 新增角色</button>
        </div>

        {err && <div className="ab-hint" style={{ color: '#ffb4ac', marginBottom: 12 }}>{err}</div>}

        {loading ? (
          <div className="ab-empty">加载中…</div>
        ) : roles.length === 0 ? (
          <div className="ab-empty">
            还没有角色<br />
            <button className="ab-btn primary" style={{ marginTop: 14 }} onClick={() => setShowNew(true)}>创建第一个角色</button>
          </div>
        ) : (
          <div className="ab-grid">
            {roles.map((r) => {
              const on = selected.includes(r.id)
              return (
                <div
                  key={r.id}
                  className={'ab-card' + (on ? ' sel' : '')}
                  onClick={() => onCard(r)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter') onCard(r) }}
                >
                  {manage && <span className={'ab-check' + (on ? ' on' : '')}>{on ? '✓' : ''}</span>}
                  <div className="avatar" style={{ color: r.color }}>{r.avatar}</div>
                  <div>
                    <div className="nm">{r.name}</div>
                    <div className="st">{r.subtitle || '未填写副标题'}</div>
                  </div>
                  <div className="meta">
                    <span className="pill">{r.voice_kind === 'upload' ? '上传声线' : '预置音色'}</span>
                    {r.memory_episodes > 0 && <span className="pill">记忆 {r.memory_episodes}</span>}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>

      <div className="ab-devbar">
        <span className={'live ' + (online ? 'on' : 'off')}>
          <i />{online ? '硬件在线' : '硬件离线'}
        </span>
        <span className="sep" />
        <span>当前角色<b>{device?.role?.name || '未部署'}</b></span>
        <span className="sep" />
        <span>电量<b>{batteryText}</b></span>
        <span className="sep" />
        <span>信号<b>{sigText}</b></span>
        {ds.ip && <><span className="sep" /><span>IP<b>{ds.ip}</b></span></>}
        <span className="sep" />
        <span className={online ? '' : 'warn'}>{noteText}</span>
        {device?.last_seen && (
          <>
            <span className="sep" />
            <span>心跳<b>{device.last_seen.slice(11)}</b></span>
          </>
        )}
      </div>

      {manage && (
        <div className="ab-bar">
          <span className="info">已选 {selected.length} / {roles.length}</span>
          <button className="ab-btn ghost" onClick={() => setSelected(roles.map((r) => r.id))}>全选</button>
          <button className="ab-btn ghost" onClick={() => setSelected([])}>清空</button>
          <span className="spacer" />
          <button className="ab-btn danger" onClick={doBulkDelete} disabled={!selected.length || busy}>
            {busy ? '删除中…' : `删除所选 (${selected.length})`}
          </button>
        </div>
      )}

      {showNew && (
        <div className="ab-mask" onClick={() => !busy && setShowNew(false)}>
          <div className="ab-modal" onClick={(e) => e.stopPropagation()}>
            <h3>新增角色</h3>
            <div className="ab-field">
              <label>角色名</label>
              <input className="ab-input" autoFocus value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Enter') doCreate() }}
                placeholder="例如：MOSS" />
            </div>
            <div className="ab-field">
              <label>副标题</label>
              <input className="ab-input" value={draft.subtitle}
                onChange={(e) => setDraft({ ...draft, subtitle: e.target.value })}
                placeholder="例如：550W · 量子计算机" />
            </div>
            <div className="ab-field">
              <label>头像符号</label>
              <div className="ab-chips">
                {AVATAR_CHOICES.map((a) => (
                  <span key={a} className="ab-chip rem"
                    style={draft.avatar === a ? { borderColor: '#5ec8f2', color: '#5ec8f2' } : null}
                    onClick={() => setDraft({ ...draft, avatar: a })}>{a}</span>
                ))}
              </div>
            </div>
            <div className="ab-field">
              <label>主题色</label>
              <div className="ab-chips">
                {COLOR_CHOICES.map((c) => (
                  <span key={c} className="ab-chip rem"
                    style={{ borderColor: draft.color === c ? c : undefined, color: c }}
                    onClick={() => setDraft({ ...draft, color: c })}>●</span>
                ))}
              </div>
            </div>
            <div className="ab-hint" style={{ marginTop: 4 }}>
              创建后会直接进入编辑页，设定 / 性格 / 声音 / 记忆都在里面改。
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
              <button className="ab-btn ghost" onClick={() => setShowNew(false)} disabled={busy}>取消</button>
              <button className="ab-btn primary" onClick={doCreate} disabled={busy || !draft.name.trim()}>
                {busy ? '创建中…' : '创建并编辑'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
