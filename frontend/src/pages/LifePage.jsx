import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authFetch } from '../api/http'
import './life.css'

const VIEWS = [
  { key: 'stars', icon: '✧', label: '星图' },
  { key: 'health', icon: '♥', label: '健康' },
  { key: 'space', icon: '⌂', label: '空间' },
  { key: 'chat', icon: '◍', label: '对话' },
]

export default function LifePage() {
  const [view, setView] = useState('stars')
  const [health, setHealth] = useState(null)
  const [stats, setStats] = useState({ memories: 0, episodes: 0, days: 0, relations: 0 })
  const [say, setSay] = useState('…')
  const [msgs, setMsgs] = useState([])
  const [speakOn, setSpeakOn] = useState(false)
  const [voice, setVoice] = useState('zh-CN-XiaoyiNeural')
  const [voices, setVoices] = useState([])
  const [vitals, setVitals] = useState(null)
  const [space, setSpace] = useState(null)
  const [refusal, setRefusal] = useState('')
  const [listening, setListening] = useState(false)
  const [recording, setRecording] = useState(false)
  const [asrSupported, setAsrSupported] = useState(true)
  const [interim, setInterim] = useState('')
  const recogRef = useRef(null)
  const [level, setLevel] = useState(0)
  const [lastClip, setLastClip] = useState(null)
  const recRef = useRef(null)
  const chunksRef = useRef([])
  const meterRef = useRef(null)
  const navigate = useNavigate()
  const audioRef = useRef(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)

  const canvasRef = useRef(null)
  const hintRef = useRef(null)
  const dataRef = useRef({ nodes: [], edges: [] })
  const sizeRef = useRef({ w: 0, h: 0 })
  const rotRef = useRef(0)

  /* ---------------- 数据 ---------------- */
  const loadHealth = useCallback(async () => {
    try {
      const r = await authFetch('/api/life/health')
      if (!r.ok) return
      setHealth(await r.json())
      try {
        const v = await authFetch('/api/life/vitals')
        if (v.ok) setVitals(await v.json())
      } catch (e) { /* 忽略 */ }
      try {
        const s = await authFetch('/api/life/space')
        if (s.ok) setSpace(await s.json())
      } catch (e) { /* 忽略 */ }
    } catch (e) { /* 忽略 */ }
  }, [])

  useEffect(() => {
    ;(async () => {
      try {
        const r = await authFetch('/api/life/history')
        if (r.ok) {
          const d = await r.json()
          if (Array.isArray(d.messages) && d.messages.length) {
            setMsgs(d.messages.slice(-30))
            setSay(d.messages[d.messages.length - 1].content)
          }
        }
      } catch (e) { /* 忽略 */ }
    })()
  }, [])

  useEffect(() => {
    ;(async () => {
      try {
        const r = await authFetch('/api/life/voices')
        if (r.ok) {
          const d = await r.json()
          setVoices(d.voices || [])
        }
      } catch (e) { /* 忽略 */ }
    })()
  }, [])

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    setAsrSupported(!!SR)
  }, [])

  useEffect(() => {
    loadHealth()
    const t = setInterval(loadHealth, 30000)
    return () => clearInterval(t)
  }, [loadHealth])

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const r = await authFetch('/api/life/graph')
        if (!r.ok) return
        const d = await r.json()
        if (!alive) return
        dataRef.current = { nodes: d.nodes || [], edges: d.edges || [] }
        setStats(d.stats || {})
      } catch (e) { /* 忽略 */ }
    })()
    return () => { alive = false }
  }, [])

  /* ---------------- 星图 ---------------- */
  useEffect(() => {
    const cv = canvasRef.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let raf = 0

    const resize = () => {
      const rect = cv.parentElement.getBoundingClientRect()
      sizeRef.current = { w: rect.width || 400, h: rect.height || 600 }
      cv.width = sizeRef.current.w * dpr
      cv.height = sizeRef.current.h * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(cv.parentElement)

    const project = (n, R) => {
      const { w, h } = sizeRef.current
      const x = n.x * R
      const y = n.y * R * 0.62
      const c = Math.cos(rotRef.current)
      const s = Math.sin(rotRef.current)
      return {
        x: w / 2 + x * c - y * s,
        y: h / 2 + 20 + x * s + y * c,
        z: 1 - Math.min(1, Math.hypot(n.x, n.y)) * 0.5,
      }
    }

    const draw = (t) => {
      const { w, h } = sizeRef.current
      const nodes = dataRef.current.nodes
      const edges = dataRef.current.edges
      ctx.clearRect(0, 0, w, h)
      const R = Math.min(w, h * 1.5) * 0.46

      const glow = ctx.createRadialGradient(w / 2, h / 2 + 20, 0, w / 2, h / 2 + 20, R * 1.15)
      glow.addColorStop(0, 'rgba(70,120,220,.18)')
      glow.addColorStop(0.45, 'rgba(30,60,140,.08)')
      glow.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = glow
      ctx.fillRect(0, 0, w, h)

      for (let i = 0; i < 260; i++) {
        const a = (i * 2.399963) % (Math.PI * 2)
        const rr = Math.sqrt((i + 1) / 261) * R * 1.05
        const x = w / 2 + Math.cos(a + rotRef.current * 0.25) * rr
        const y = h / 2 + 20 + Math.sin(a + rotRef.current * 0.25) * rr * 0.62
        const tw = 0.1 + 0.22 * Math.abs(Math.sin(t / 2200 + i))
        ctx.fillStyle = 'rgba(170,200,255,' + tw.toFixed(3) + ')'
        ctx.beginPath(); ctx.arc(x, y, 0.9, 0, 7); ctx.fill()
      }

      rotRef.current += 0.0006
      const pos = new Map()
      for (const n of nodes) pos.set(n.id, project(n, R))

      ctx.lineWidth = 1
      for (const e of edges) {
        const a = pos.get(e.a); const b = pos.get(e.b)
        if (!a || !b || e.a === e.b) continue
        const d = Math.hypot(a.x - b.x, a.y - b.y)
        const alpha = Math.max(0, 0.5 - d / (R * 1.6)) * (e.w || 0.4)
        if (alpha <= 0.01) continue
        ctx.strokeStyle = 'rgba(140,180,255,' + alpha.toFixed(3) + ')'
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()
      }

      for (const n of nodes) {
        const p = pos.get(n.id)
        if (!p) continue
        const pulse = 1 + 0.18 * Math.sin(t / 900 + (n.x + n.y) * 8)
        let color = 'rgba(220,232,255,.85)'
        let r = n.r * p.z
        if (n.kind === 'fact') { color = 'rgba(246,192,74,.95)'; r *= 1.4 * pulse }
        else if (n.kind === 'diary') { color = 'rgba(169,139,240,.95)'; r *= 1.2 }
        else if (n.kind === 'self') {
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 26)
          g.addColorStop(0, 'rgba(255,255,255,.95)')
          g.addColorStop(0.35, 'rgba(120,200,255,.55)')
          g.addColorStop(1, 'rgba(120,200,255,0)')
          ctx.fillStyle = g
          ctx.beginPath(); ctx.arc(p.x, p.y, 26, 0, 7); ctx.fill()
          color = '#fff'; r = 4.5
        } else {
          r *= 0.8 + 0.4 * Math.sin(t / 1400 + n.x * 20)
        }
        ctx.fillStyle = color
        ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1, r), 0, 7); ctx.fill()
      }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)

    const onMove = (ev) => {
      const rect = cv.getBoundingClientRect()
      const mx = ev.clientX - rect.left
      const my = ev.clientY - rect.top
      const R = Math.min(sizeRef.current.w, sizeRef.current.h * 1.5) * 0.46
      let best = null; let bd = 22
      for (const n of dataRef.current.nodes) {
        const p = project(n, R)
        const d = Math.hypot(p.x - mx, p.y - my)
        if (d < bd) { bd = d; best = n }
      }
      const el = hintRef.current
      if (!el) return
      if (best) {
        el.textContent = best.label || ''
        el.style.visibility = 'visible'
        el.style.left = (mx + 12) + 'px'
        el.style.top = (my - 10) + 'px'
      } else {
        el.style.visibility = 'hidden'
      }
    }
    cv.addEventListener('pointermove', onMove)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      cv.removeEventListener('pointermove', onMove)
    }
  }, [])

  /* ---------------- 对话 ---------------- */
  const send = async () => {
    const text = draft.trim()
    if (!text || sending) return
    setDraft('')
    setSending(true)
    setSay('…')
    setMsgs((m) => m.concat([{ role: 'user', text }]).slice(-40))
    try {
      const r = await authFetch('/api/life/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      const d = await r.json()
      const reply = d.ok ? d.reply : '（信号不好）' + (d.error || '')
      setSay(reply)
      setMsgs((m) => m.concat([{ role: 'bot', text: reply }]).slice(-40))
    } catch (e) {
      setSay('（断线了）')
    } finally {
      setSending(false)
      loadHealth()
    }
  }

  useEffect(() => {
    if (!speakOn || !say || say === '…' || sending) return
    let dead = false
    ;(async () => {
      try {
        const r = await authFetch('/api/life/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: say, voice, rate: '+2%', pitch: '+18Hz' }),
        })
        if (!r.ok) throw new Error('tts ' + r.status)
        const blob = await r.blob()
        if (dead) return
        const url = URL.createObjectURL(blob)
        if (!audioRef.current) audioRef.current = new Audio()
        audioRef.current.src = url
        await audioRef.current.play().catch(() => {})
      } catch (e) {
        if (typeof window !== 'undefined' && window.speechSynthesis) {
          const u = new SpeechSynthesisUtterance(say)
          u.lang = 'zh-CN'
          window.speechSynthesis.speak(u)
        }
      }
    })()
    return () => { dead = true }
  }, [say, speakOn, voice, sending])

  const startRecognition = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) return
    if (recording) { try { recogRef.current && recogRef.current.stop() } catch (e) {} return }
    const rec = new SR()
    rec.lang = 'zh-CN'
    rec.interimResults = true
    rec.continuous = false
    rec.onresult = (ev) => {
      let finalText = ''
      let partial = ''
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const t = ev.results[i][0].transcript
        if (ev.results[i].isFinal) finalText += t
        else partial += t
      }
      setInterim(partial)
      if (finalText) {
        setDraft((d) => (d ? d + ' ' : '') + finalText)
        setInterim('')
      }
    }
    rec.onerror = (ev) => {
      setRecording(false)
      setInterim('')
      setRefusal('识别失败：' + (ev.error || '未知'))
    }
    rec.onend = () => { setRecording(false); setInterim('') }
    recogRef.current = rec
    rec.start()
    setRecording(true)
    setRefusal('')
  }

  const mic = () => {
    if (asrSupported) startRecognition()
    else startRecording()
  }

  const startRecording = async () => {
    if (recording) {
      recRef.current && recRef.current.stop()
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      const src = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 512
      src.connect(analyser)
      const buf = new Uint8Array(analyser.frequencyBinCount)
      const tick = () => {
        analyser.getByteTimeDomainData(buf)
        let sum = 0
        for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v }
        setLevel(Math.min(1, Math.sqrt(sum / buf.length) * 3.2))
        meterRef.current = requestAnimationFrame(tick)
      }
      tick()

      const rec = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '' })
      chunksRef.current = []
      rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data) }
      rec.onstop = () => {
        cancelAnimationFrame(meterRef.current)
        stream.getTracks().forEach((t) => t.stop())
        ctx.close()
        setRecording(false)
        setLevel(0)
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        setLastClip({ size: blob.size, url: URL.createObjectURL(blob), at: Date.now() })
        setDraft((d) => d || '[语音] ')
      }
      recRef.current = rec
      rec.start()
      setRecording(true)
      setRefusal('')
    } catch (e) {
      setRefusal('麦克风打不开：' + (e.message || e.name))
    }
  }

  const startVoiceInput = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) { setSay('这个浏览器不支持语音输入，换 Edge/Chrome 试试'); return }
    const rec = new SR()
    rec.lang = 'zh-CN'
    rec.interimResults = false
    rec.maxAlternatives = 1
    setListening(true)
    rec.onresult = (ev) => {
      const text = ev.results[0][0].transcript
      setDraft((d) => (d ? d + ' ' : '') + text)
    }
    rec.onerror = () => setListening(false)
    rec.onend = () => setListening(false)
    rec.start()
  }

  const saveVoice = async (v) => {
    try {
      await authFetch('/api/life/pet-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voice: v }),
      })
    } catch (e) { /* 忽略 */ }
  }

  const moveTo = async (id) => {
    setRefusal('')
    try {
      const r = await authFetch('/api/life/space/move', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spot: id }),
      })
      const d = await r.json()
      if (!d.ok) setRefusal(d.error || '她不想动')
      const s = await authFetch('/api/life/space')
      if (s.ok) setSpace(await s.json())
    } catch (e) { setRefusal('（连不上）') }
  }

  const feed = async () => {
    try { await authFetch('/api/life/feed', { method: 'POST' }); loadHealth() } catch (e) { /* 忽略 */ }
  }

  const hungerPct = health ? Math.min(1, health.hunger.value / 100) : 0
  const hungerColor = hungerPct > 0.75 ? '#f2695c' : (hungerPct > 0.45 ? '#f6c04a' : '#5ec8f2')

  const logRef = useRef(null)
  useEffect(() => {
    const el = logRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [msgs, sending])

  return (
    <div className="life-root">
      <header className="life-header">
        <span className="dot" /> 大肥鱼
        <span className="sub">{new Date().toTimeString().slice(0, 5)}</span>
        <button className="life-back" onClick={() => navigate('/')}>← 返回大厅</button>
      </header>

      <main className="life-main">
        <section className={'life-view' + (view === 'stars' ? ' on' : '')}>
          <canvas id="life-stars" ref={canvasRef} />
          <div className="life-stats">
            <div className="life-stat"><b>{stats.memories}</b><span>记忆</span></div>
            <div className="life-stat"><b>{stats.episodes}</b><span>事件</span></div>
            <div className="life-stat"><b>{stats.days}</b><span>天</span></div>
            <div className="life-stat"><b>{stats.relations}</b><span>关系</span></div>
          </div>
          <div className="life-curve">
            <h4>遗忘曲线</h4>
            <svg viewBox="0 0 120 52" preserveAspectRatio="none">
              <defs>
                <linearGradient id="life-g1" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#5ec8f2" />
                  <stop offset="1" stopColor="#5ec8f2" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d="M0 6 C 18 26, 34 34, 60 38 S 100 42, 120 44 L120 52 L0 52 Z" fill="url(#life-g1)" opacity="0.22" />
              <path d="M0 6 C 18 26, 34 34, 60 38 S 100 42, 120 44" fill="none" stroke="#5ec8f2" strokeWidth="1.4" opacity="0.85" />
            </svg>
          </div>
          <div className="life-hint" ref={hintRef} />
          <div className="life-tip">记忆库运作原理 · 鼠标悬停看细节</div>
        </section>

        <section className={'life-view' + (view === 'health' ? ' on' : '')}>
          <div className="life-health">
            <div className="vital-hero">
              <div className="vital-tags">
                {(vitals && vitals.tags ? vitals.tags : []).map((t, i) => (
                  <span key={i} className={'life-tag' + (i === 0 ? ' hot' : '')}>{t}</span>
                ))}
                {vitals && vitals.labels && ['label_thirst', 'label_hunger', 'label_sleep'].map((k) => (
                  <span key={k} className="life-tag dim">{vitals.labels[k]}</span>
                ))}
              </div>
              <div className="vital-water">
                <div className="jar">
                  <div className="jar-fill" style={{ height: (vitals ? (1 - vitals.state.thirst) * 100 : 0) + '%' }} />
                </div>
                <div className="jar-cap">水罐</div>
              </div>
            </div>

            <div className="life-card life-bars">
              <h3>十二套子系统</h3>
              {(vitals ? vitals.bars : []).map((b) => (
                <div className="life-bar" key={b.key}>
                  <div className="name">{b.name}</div>
                  <div className="track">
                    <div className="fill" style={{ width: (b.v * 100).toFixed(0) + '%', background: b.v > 0.7 ? '#f2695c' : (b.v > 0.4 ? '#f6c04a' : '#5ec8f2') }} />
                  </div>
                  <div className="val">{(b.v * 100).toFixed(0)}</div>
                </div>
              ))}
            </div>

            <div className="life-card">
              <h3>派生状态</h3>
              {vitals && Object.entries(vitals.derived).map(([k, v]) => (
                <div className="life-bar" key={k}>
                  <div className="name">{
                    ({ energy: '精力', mood: '心情', arousal: '唤醒', calm: '平静', attachment: '依恋', stress: '压力' })[k] || k
                  }</div>
                  <div className="track"><div className="fill" style={{ width: (v * 100).toFixed(0) + '%', background: '#a98bf0' }} /></div>
                  <div className="val">{(v * 100).toFixed(0)}</div>
                </div>
              ))}
            </div>

            <div className="life-card life-mood">
              <div className="life-avatar" />
              <div className="info">
                <b>{vitals ? vitals.labels.label_mood : '—'}</b>
                <span>状态直出 · {vitals ? new Date(vitals.updated_at * 1000).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : ''}</span>
              </div>
              <button className="life-btn" style={{ marginLeft: 'auto' }} onClick={feed}>🥤</button>
            </div>
          </div>
        </section>

        <section className={'life-view' + (view === 'space' ? ' on' : '')}>
          <div className="life-space">
            <div className="room">
              <div className="room-floor" />
              {(space ? space.spots : []).map((s) => (
                <button
                  key={s.id}
                  className={'spot' + (space && s.id === space.spot ? ' here' : '')}
                  style={{ left: (s.x * 100).toFixed(1) + '%', top: (s.y * 100).toFixed(1) + '%' }}
                  onClick={() => moveTo(s.id)}
                >{s.name}</button>
              ))}
              {space && (
                <div className="pet-dot" style={{ left: (space.pos.x * 100).toFixed(1) + '%', top: (space.pos.y * 100).toFixed(1) + '%' }}>
                  <span>🐋</span>
                </div>
              )}
            </div>
            <div className="space-info">
              <b>{space ? space.spot_name + ' · ' + space.act : '—'}</b>
              <span>{space && space.can_move ? '她愿意走走' : (space ? '还有 ' + Math.ceil(space.busy_left / 60) + ' 分钟才想动' : '')}</span>
              {refusal && <em>{refusal}</em>}
            </div>
          </div>
        </section>

        <section className={'life-view' + (view === 'chat' ? ' on' : '')}>
          <div className="life-stage">
            <div className="life-charbg">
              <div className="life-call">
                <div className="aur" />
                <div className="tag"><i />视频通话中</div>
                
                <div className="meta"><b>大肥鱼</b><span>在线 · 信号良好</span></div>
                <div className="life-wave">
                  {Array.from({ length: 22 }).map((_, i) => (
                    <span key={i} style={{ animationDelay: (i * 0.07).toFixed(2) + 's' }} />
                  ))}
                </div>
              </div>
              <div className="life-log" ref={logRef}>
                {msgs.map((m, i) => (
                  <div key={i} className={'life-bubble ' + (m.role === 'user' ? 'me' : 'bot')}>{m.text}</div>
                ))}
              </div>
              {!asrSupported && (
                <div className="life-asr-note">
                  语音识别仅支持 <b>Chrome / Edge</b>（含安卓版）；Safari、Firefox 请用文字输入。
                </div>
              )}
              {recording && asrSupported && (
                <div className="life-rec">
                  <span className="rec-dot" />
                  <span className="rec-txt">{interim ? '「' + interim + '」' : '在听…'}</span>
                </div>
              )}
              {recording && !asrSupported && (
                <div className="life-rec">
                  <span className="rec-dot" />
                  <div className="rec-meter"><div style={{ width: (level * 100).toFixed(0) + '%' }} /></div>
                  <span className="rec-txt">录音中</span>
                </div>
              )}
              {lastClip && !recording && (
                <div className="life-clip">
                  <audio src={lastClip.url} controls />
                  <span>{(lastClip.size / 1024).toFixed(1)} KB</span>
                </div>
              )}
              <div className="life-sub">
                <span className="who">大肥鱼</span>{sending ? '正在想说…' : say}
              </div>
            </div>
            <div className="life-dock">
              <button
                className={'life-btn' + (recording ? ' on' : '')}
                title={recording ? '再点一下结束' : (asrSupported ? '语音输入（说完自动填字）' : '录音（此浏览器不支持识别）')}
                onClick={mic}
              >{recording ? '■' : '🎤'}</button>
              <button className={'life-btn' + (speakOn ? ' on' : '')} title="朗读回复"
                onClick={() => setSpeakOn((v) => !v)}>{speakOn ? '🔊' : '🔇'}</button>
              <select className="life-voice" value={voice} onChange={(e) => { setVoice(e.target.value); saveVoice(e.target.value) }}
                title="选择声线（会自动同步给 QQ 机器人）">
                {(voices.length ? voices : [{ id: 'zh-CN-XiaoyiNeural', name: '晓伊' }]).map((v) => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') send() }}
                placeholder="说点什么…"
              />
              <button className="life-btn main" onClick={send}>↑</button>
            </div>
          </div>
        </section>
      </main>

      <nav className="life-nav">
        {VIEWS.map((v) => (
          <button key={v.key} className={view === v.key ? 'on' : ''} onClick={() => setView(v.key)}>
            <i>{v.icon}</i>{v.label}
          </button>
        ))}
      </nav>
    </div>
  )
}
