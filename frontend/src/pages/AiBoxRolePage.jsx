import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  getRole, patchRole, previewPrompt, listVoices, uploadVoice, deleteVoice,
  ttsBlob, getMemory, addMemory, deployRole, getDevice,
} from '../api/aibox'
import './aibox.css'

const TABS = [
  { key: 'spec', icon: '▤', label: '设定' },
  { key: 'personality', icon: '✧', label: '性格' },
  { key: 'voice', icon: '♪', label: '声音' },
  { key: 'memory', icon: '◍', label: '记忆' },
]

const lines = (arr) => (Array.isArray(arr) ? arr.join('\n') : '')
const toLines = (s) => (s || '').split('\n').map((x) => x.trim()).filter(Boolean)

export default function AiBoxRolePage() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [role, setRole] = useState(null)
  const [tab, setTab] = useState('spec')
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const [voices, setVoices] = useState([])
  const [mem, setMem] = useState({ memory: null, events: [] })
  const [showPrompt, setShowPrompt] = useState(null)
  const [newTrait, setNewTrait] = useState('')
  const [newMem, setNewMem] = useState('')
  const [deploy, setDeploy] = useState({ phase: 'idle', msg: '' })
  const audioRef = useRef(null)
  const fileRef = useRef(null)

  const flash = (msg, isErr) => {
    setToast({ msg, isErr })
    window.setTimeout(() => setToast(null), 2200)
  }

  const load = useCallback(async () => {
    try {
      const r = await getRole(id)
      setRole(r)
      setDirty(false)
    } catch (e) {
      flash(e.message || '加载失败', true)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    (async () => {
      try { setVoices(await listVoices()) } catch (e) { /* 忽略 */ }
    })()
  }, [])

  useEffect(() => {
    if (tab !== 'memory') return
    ;(async () => {
      try { setMem(await getMemory(id)) } catch (e) { /* 忽略 */ }
    })()
  }, [tab, id])

  if (!role) {
    return (
      <div className="ab-root">
        <header className="ab-header"><span className="dot" /> AI BOX <span className="spacer" />
          <button className="ab-back" onClick={() => navigate('/aibox')}>← 返回</button>
        </header>
        <main className="ab-main"><div className="ab-empty">加载中…</div></main>
      </div>
    )
  }

  const payload = role.payload || {}
  const spec = payload.spec || {}
  const per = payload.personality || {}
  const voice = payload.voice || {}
  const memory = payload.memory || {}

  const setTop = (k, v) => { setRole({ ...role, [k]: v }); setDirty(true) }
  const setBranch = (branch, k, v) => {
    setRole({ ...role, payload: { ...payload, [branch]: { ...(payload[branch] || {}), [k]: v } } })
    setDirty(true)
  }
  const setTrait = (k, v) => {
    setBranch('personality', 'traits', { ...(per.traits || {}), [k]: v })
  }

  const save = async () => {
    setSaving(true)
    try {
      await patchRole(id, {
        name: role.name, subtitle: role.subtitle, avatar: role.avatar,
        color: role.color, payload: role.payload,
      })
      setDirty(false)
      flash('已保存')
    } catch (e) {
      flash(e.message || '保存失败', true)
    } finally {
      setSaving(false)
    }
  }

  const playVoice = async (v) => {
    try {
      const url = v.kind === 'upload' && v.url ? v.url : null
      if (url) {
        if (audioRef.current) { audioRef.current.src = url; audioRef.current.play() }
        return
      }
      const blob = await ttsBlob({
        text: `你好，我是${role.name}。这句是用来试听的。`,
        voiceId: v.id, rate: v.rate || '+0%', pitch: v.pitch || '+0Hz',
      })
      const obj = URL.createObjectURL(blob)
      if (audioRef.current) { audioRef.current.src = obj; audioRef.current.play() }
    } catch (e) {
      flash('试听失败', true)
    }
  }

  const onUpload = async (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    try {
      const res = await uploadVoice(f)
      setVoices(await listVoices())
      setBranch('voice', 'kind', 'upload')
      setBranch('voice', 'voice_id', res.voice.id)
      flash('声线已上传')
    } catch (err) {
      flash(err.message || '上传失败', true)
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const removeVoice = async (v) => {
    if (!window.confirm(`删除声线「${v.name}」？`)) return
    try {
      await deleteVoice(v.id)
      setVoices(await listVoices())
      if (voice.voice_id === v.id) setBranch('voice', 'voice_id', 'zh-CN-XiaoxiaoNeural')
      flash('已删除')
    } catch (err) {
      flash(err.message || '删除失败', true)
    }
  }

  const onDeploy = async () => {
    if (!window.confirm(`把「${role.name}」部署到硬件？\n\n硬件会自动重启并做一次自检，重启后保持这个角色。`)) return
    setDeploy({ phase: 'pending', msg: '正在下发…' })
    try {
      const res = await deployRole(id)
      const rev = res.revision
      setDeploy({ phase: 'applying', msg: `已下发 (rev ${rev})，等待硬件重启自检…` })
      const t0 = Date.now()
      while (Date.now() - t0 < 90000) {
        await new Promise((r) => setTimeout(r, 3000))
        const d = await getDevice()
        const ds = d.status || {}
        if (d.applied_rev >= rev && ds.online) {
          setDeploy({
            phase: 'done',
            msg: `已部署 · 自检${(ds.self_check && ds.self_check.ok) ? '通过' : '有未通过项'} · IP ${ds.ip || '—'}`,
          })
          return
        }
        setDeploy({ phase: 'applying', msg: `硬件重启中…（已应用 rev ${d.applied_rev} / 目标 ${rev}）` })
      }
      setDeploy({ phase: 'error', msg: '等太久没收到硬件回报，检查电脑上的桥接程序是否在跑' })
    } catch (e) {
      setDeploy({ phase: 'error', msg: e.message || '部署失败' })
    }
  }

  const doPreviewPrompt = async () => {
    try { setShowPrompt(await previewPrompt(id)) } catch (e) { flash('生成失败', true) }
  }

  return (
    <div className="ab-root">
      <header className="ab-header">
        <span className="dot" /> AI BOX
        <span className="spacer" />
        <button className="ab-back" onClick={() => navigate('/aibox')}>← 返回角色列表</button>
      </header>

      <main className="ab-main">
        <div className="ab-hero">
          <div className="avatar" style={{ color: role.color }}>{role.avatar}</div>
          <div className="t">
            <b>{role.name}</b>
            <span>{role.subtitle || '未填写副标题'}</span>
          </div>
          <span className="spacer" />
          <button className="ab-btn" onClick={doPreviewPrompt}>查看系统提示词</button>
          <button className="ab-btn primary" onClick={onDeploy}
            disabled={deploy.phase === 'pending' || deploy.phase === 'applying'}>
            {deploy.phase === 'pending' || deploy.phase === 'applying' ? '部署中…' : '部署到硬件'}
          </button>
        </div>

        {deploy.phase !== 'idle' && (
          <div className="ab-hint" style={{
            marginTop: -8, marginBottom: 14,
            color: deploy.phase === 'error' ? '#ffb4ac'
              : deploy.phase === 'done' ? '#9ff0c4' : '#f6c04a',
          }}>
            {deploy.msg}
          </div>
        )}

        {/* ---------------- 设定 ---------------- */}
        <section className={'ab-view' + (tab === 'spec' ? ' on' : '')}>
          <div className="ab-pane">
            <div className="ab-cardbox">
              <h4>基础</h4>
              <div className="ab-row">
                <div className="ab-field">
                  <label>角色名</label>
                  <input className="ab-input" value={role.name} onChange={(e) => setTop('name', e.target.value)} />
                </div>
                <div className="ab-field">
                  <label>副标题</label>
                  <input className="ab-input" value={role.subtitle || ''}
                    onChange={(e) => setTop('subtitle', e.target.value)} placeholder="例如：550W · 量子计算机" />
                </div>
              </div>
              <div className="ab-row">
                <div className="ab-field">
                  <label>头像符号</label>
                  <input className="ab-input" value={role.avatar || ''}
                    onChange={(e) => setTop('avatar', e.target.value)} maxLength={4} />
                </div>
                <div className="ab-field">
                  <label>主题色</label>
                  <input className="ab-input" type="color" value={role.color || '#5ec8f2'}
                    onChange={(e) => setTop('color', e.target.value)}
                    style={{ height: 38, padding: 4 }} />
                </div>
              </div>
            </div>

            <div className="ab-cardbox">
              <h4>身份与世界</h4>
              <div className="ab-field">
                <label>身份（她是"谁"）</label>
                <textarea className="ab-textarea" value={spec.identity || ''}
                  onChange={(e) => setBranch('spec', 'identity', e.target.value)}
                  placeholder="一句话交代她是谁、处在什么位置、有什么来历。" />
              </div>
              <div className="ab-field">
                <label>所处世界</label>
                <textarea className="ab-textarea" value={spec.world || ''}
                  onChange={(e) => setBranch('spec', 'world', e.target.value)}
                  placeholder="世界观、时代、关键设定的简述。" />
              </div>
              <div className="ab-field">
                <label>当前场景</label>
                <textarea className="ab-textarea" value={spec.scenario || ''}
                  onChange={(e) => setBranch('spec', 'scenario', e.target.value)}
                  placeholder="对话发生在什么情境下，对方是谁。" />
              </div>
              <div className="ab-row">
                <div className="ab-field">
                  <label>开场白</label>
                  <input className="ab-input" value={spec.greeting || ''}
                    onChange={(e) => setBranch('spec', 'greeting', e.target.value)} />
                </div>
                <div className="ab-field">
                  <label>边界 / 不可越线</label>
                  <input className="ab-input" value={spec.boundaries || ''}
                    onChange={(e) => setBranch('spec', 'boundaries', e.target.value)} />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ---------------- 性格 ---------------- */}
        <section className={'ab-view' + (tab === 'personality' ? ' on' : '')}>
          <div className="ab-pane">
            <div className="ab-cardbox">
              <h4>性格维度（0-10，决定提示词里的"性格侧重"）</h4>
              {Object.entries(per.traits || {}).map(([k, v]) => (
                <div className="ab-trait" key={k}>
                  <div className="k">{k}</div>
                  <input type="range" min="0" max="10" step="1" value={v}
                    onChange={(e) => setTrait(k, Number(e.target.value))} />
                  <div className="v">{v}</div>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <input className="ab-input" style={{ flex: 1 }} value={newTrait}
                  onChange={(e) => setNewTrait(e.target.value)} placeholder="新增维度，例如：占有欲" />
                <button className="ab-btn" onClick={() => {
                  const k = newTrait.trim()
                  if (!k) return
                  setTrait(k, 5); setNewTrait('')
                }}>添加</button>
              </div>
            </div>

            <div className="ab-cardbox">
              <h4>说话方式</h4>
              <div className="ab-field">
                <label>语气与句式</label>
                <textarea className="ab-textarea" value={per.speech_style || ''}
                  onChange={(e) => setBranch('personality', 'speech_style', e.target.value)}
                  placeholder="句长、标点习惯、口头禅密度、情绪起伏幅度…" />
              </div>
              <div className="ab-field">
                <label>关键词（逗号或换行分隔）</label>
                <textarea className="ab-textarea" style={{ minHeight: 56 }}
                  value={lines(per.keywords)} onChange={(e) => setBranch('personality', 'keywords', toLines(e.target.value))} />
              </div>
              <div className="ab-field">
                <label>口头禅（每行一句）</label>
                <textarea className="ab-textarea" style={{ minHeight: 56 }}
                  value={lines(per.catchphrase)} onChange={(e) => setBranch('personality', 'catchphrase', toLines(e.target.value))} />
              </div>
              <div className="ab-field">
                <label>禁止（每行一条）</label>
                <textarea className="ab-textarea" style={{ minHeight: 56 }}
                  value={lines(per.taboos)} onChange={(e) => setBranch('personality', 'taboos', toLines(e.target.value))} />
              </div>
              <div className="ab-field">
                <label>情绪底色</label>
                <input className="ab-input" value={(per.emotional_baseline || {}).note || ''}
                  onChange={(e) => setBranch('personality', 'emotional_baseline', {
                    ...(per.emotional_baseline || {}), note: e.target.value,
                  })}
                  placeholder="例如：表演出来的高涨，压着一层孤独。" />
              </div>
            </div>
          </div>
        </section>

        {/* ---------------- 声音 ---------------- */}
        <section className={'ab-view' + (tab === 'voice' ? ' on' : '')}>
          <div className="ab-pane">
            <div className="ab-cardbox">
              <h4>选择声线</h4>
              <div className="ab-voices">
                {voices.map((v) => (
                  <div key={v.id} className={'ab-voice' + (voice.voice_id === v.id ? ' on' : '')}
                    onClick={() => {
                      setBranch('voice', 'kind', v.kind === 'upload' ? 'upload' : 'edge')
                      setBranch('voice', 'voice_id', v.id)
                    }}>
                    <div>
                      <div className="n">{v.name}</div>
                      <div className="d">{v.desc}</div>
                    </div>
                    <span className="play" onClick={(e) => { e.stopPropagation(); playVoice(v) }}>▶</span>
                    {v.kind === 'upload' && (
                      <span className="play" title="删除" onClick={(e) => { e.stopPropagation(); removeVoice(v) }}>✕</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="ab-cardbox">
              <h4>语速 / 音调（仅对预置音色生效）</h4>
              <div className="ab-row">
                <div className="ab-field">
                  <label>语速</label>
                  <select className="ab-select" value={voice.rate || '+0%'}
                    onChange={(e) => setBranch('voice', 'rate', e.target.value)}>
                    {['-20%', '-15%', '-10%', '-8%', '-5%', '+0%', '+5%', '+6%', '+10%', '+15%', '+20%'].map((x) => (
                      <option key={x} value={x}>{x}</option>
                    ))}
                  </select>
                </div>
                <div className="ab-field">
                  <label>音调</label>
                  <select className="ab-select" value={voice.pitch || '+0Hz'}
                    onChange={(e) => setBranch('voice', 'pitch', e.target.value)}>
                    {['-10Hz', '-6Hz', '-4Hz', '-2Hz', '+0Hz', '+2Hz', '+4Hz', '+6Hz', '+10Hz'].map((x) => (
                      <option key={x} value={x}>{x}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="ab-field">
                <label>这条声线的说明</label>
                <input className="ab-input" value={voice.note || ''}
                  onChange={(e) => setBranch('voice', 'note', e.target.value)}
                  placeholder="为什么选它 / 真声需要什么条件" />
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 6 }}>
                <input ref={fileRef} type="file" accept="audio/*" style={{ display: 'none' }} onChange={onUpload} />
                <button className="ab-btn" onClick={() => fileRef.current?.click()}>上传本机声线</button>
                <button className="ab-btn" onClick={() => {
                  const v = voices.find((x) => x.id === voice.voice_id)
                  if (v) playVoice(v)
                }}>试听当前</button>
              </div>
              <div className="ab-hint" style={{ marginTop: 8 }}>
                支持 wav / mp3 / m4a / ogg / flac，单个不超过 20MB。
                上传的样本会作为「参考声线」直接回放；要做真正的音色克隆，需要在
                voice.clone 里填外部服务（GPT-SoVITS / 火山声音复刻）的 endpoint 和 ref_id。
              </div>
            </div>
          </div>
        </section>

        {/* ---------------- 记忆 ---------------- */}
        <section className={'ab-view' + (tab === 'memory' ? ' on' : '')}>
          <div className="ab-pane">
            <div className="ab-cardbox">
              <h4>档案卡（每次对话都会注入）</h4>
              <div className="ab-row">
                <div className="ab-field">
                  <label>对方称呼</label>
                  <input className="ab-input" value={(memory.profile || {}).user_name || ''}
                    onChange={(e) => setBranch('memory', 'profile', {
                      ...(memory.profile || {}), user_name: e.target.value,
                    })} />
                </div>
                <div className="ab-field">
                  <label>关系</label>
                  <input className="ab-input" value={(memory.profile || {}).relation || ''}
                    onChange={(e) => setBranch('memory', 'profile', {
                      ...(memory.profile || {}), relation: e.target.value,
                    })} />
                </div>
              </div>
              <div className="ab-row">
                <div className="ab-field">
                  <label>答应过的事（每行一条）</label>
                  <textarea className="ab-textarea" style={{ minHeight: 56 }}
                    value={lines((memory.profile || {}).promises)}
                    onChange={(e) => setBranch('memory', 'profile', {
                      ...(memory.profile || {}), promises: toLines(e.target.value),
                    })} />
                </div>
                <div className="ab-field">
                  <label>不要碰的话题（每行一条）</label>
                  <textarea className="ab-textarea" style={{ minHeight: 56 }}
                    value={lines((memory.profile || {}).triggers)}
                    onChange={(e) => setBranch('memory', 'profile', {
                      ...(memory.profile || {}), triggers: toLines(e.target.value),
                    })} />
                </div>
              </div>
            </div>

            <div className="ab-cardbox">
              <h4>长期 / 近期摘要（由记忆引擎生成，也可手改）</h4>
              <div className="ab-field">
                <label>长期摘要</label>
                <textarea className="ab-textarea" value={memory.digest || ''}
                  onChange={(e) => setBranch('memory', 'digest', e.target.value)}
                  placeholder="几个月压成一段。" />
              </div>
              <div className="ab-field">
                <label>近期摘要</label>
                <textarea className="ab-textarea" value={memory.recent || ''}
                  onChange={(e) => setBranch('memory', 'recent', e.target.value)}
                  placeholder="最近几天发生了什么。" />
              </div>
              <div className="ab-row">
                <div className="ab-field">
                  <label>注入字数上限</label>
                  <input className="ab-input" type="number" min="200" max="4000" step="100"
                    value={(memory.settings || {}).inject_max_chars ?? 1200}
                    onChange={(e) => setBranch('memory', 'settings', {
                      ...(memory.settings || {}), inject_max_chars: Number(e.target.value),
                    })} />
                </div>
                <div className="ab-field">
                  <label>启用记忆注入</label>
                  <select className="ab-select"
                    value={String((memory.settings || {}).enabled ?? true)}
                    onChange={(e) => setBranch('memory', 'settings', {
                      ...(memory.settings || {}), enabled: e.target.value === 'true',
                    })}>
                    <option value="true">启用</option>
                    <option value="false">关闭</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="ab-cardbox">
              <h4>记忆条目（{mem.events.length}）</h4>
              <div className="ab-mem-list">
                {mem.events.length === 0 && <div className="ab-hint">还没有条目。记忆引擎接上后会自动写入。</div>}
                {mem.events.map((e) => (
                  <div key={e.id} className="ab-mem">
                    <div className="mh"><span>{e.kind}</span><span>{e.created_at}</span><span>重要度 {e.importance}</span></div>
                    {e.text}
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <input className="ab-input" style={{ flex: 1 }} value={newMem}
                  onChange={(e) => setNewMem(e.target.value)} placeholder="手动记一条，例如：对方说他怕黑" />
                <button className="ab-btn" onClick={async () => {
                  const t = newMem.trim()
                  if (!t) return
                  try {
                    await addMemory(id, { kind: 'fact', text: t, importance: 0.6 })
                    setNewMem('')
                    setMem(await getMemory(id))
                    flash('已记录')
                  } catch (e) { flash('记录失败', true) }
                }}>记下来</button>
              </div>
              <div className="ab-hint" style={{ marginTop: 10 }}>
                这张表是给「记忆引擎」留的底座：检索、遗忘曲线、星图都读它。
                现在只做了写入，检索还没接。
              </div>
            </div>
          </div>
        </section>
      </main>

      <audio ref={audioRef} style={{ display: 'none' }} />

      {dirty && (
        <div className="ab-savebar">
          <span className="info" style={{ fontSize: 12.5, color: '#f6c04a' }}>有未保存的修改</span>
          <span className="spacer" />
          <button className="ab-btn ghost" onClick={load}>放弃</button>
          <button className="ab-btn primary" onClick={save} disabled={saving}>
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      )}

      <nav className="ab-nav">
        {TABS.map((t) => (
          <button key={t.key} className={tab === t.key ? 'on' : ''} onClick={() => setTab(t.key)}>
            <i>{t.icon}</i>{t.label}
          </button>
        ))}
      </nav>

      {toast && <div className={'ab-toast' + (toast.isErr ? ' err' : '')}>{toast.msg}</div>}

      {showPrompt !== null && (
        <div className="ab-mask" onClick={() => setShowPrompt(null)}>
          <div className="ab-modal" style={{ maxWidth: 720 }} onClick={(e) => e.stopPropagation()}>
            <h3>编译后的系统提示词</h3>
            <pre style={{
              whiteSpace: 'pre-wrap', fontFamily: 'Consolas, monospace', fontSize: 12,
              lineHeight: 1.7, color: '#c3d0ea', maxHeight: '60vh', overflow: 'auto',
              background: 'rgba(0,0,0,.35)', padding: 12, borderRadius: 10,
            }}>{showPrompt}</pre>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
              <button className="ab-btn" onClick={() => setShowPrompt(null)}>关闭</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
