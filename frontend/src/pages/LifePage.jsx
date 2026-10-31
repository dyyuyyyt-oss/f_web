import { useCallback, useEffect, useRef, useState } from 'react'
import { authFetch } from '../api/http'
import './life.css'

const VIEWS = [
  { key: 'stars', icon: '✧', label: '星图' },
  { key: 'health', icon: '♥', label: '健康' },
  { key: 'chat', icon: '◍', label: '对话' },
]

export default function LifePage() {
  const [view, setView] = useState('stars')
  const [health, setHealth] = useState(null)
  const [stats, setStats] = useState({ memories: 0, episodes: 0, days: 0, relations: 0 })
  const [say, setSay] = useState('…')
  const [msgs, setMsgs] = useState([])
  const [speakOn, setSpeakOn] = useState(false)
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
    } catch (e) { /* 忽略 */ }
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
    if (!speakOn || !say || say === '…' || typeof window === 'undefined' || !window.speechSynthesis) return
    try {
      window.speechSynthesis.cancel()
      const u = new SpeechSynthesisUtterance(say)
      u.lang = 'zh-CN'
      u.rate = 1.02
      u.pitch = 1.15
      window.speechSynthesis.speak(u)
    } catch (e) { /* 忽略 */ }
  }, [say, speakOn])

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
            <div className="life-row">
              <div className="life-card">
                <h3>饥饿值</h3>
                <div className="life-ring">
                  <svg width="104" height="104" viewBox="0 0 104 104">
                    <circle cx="52" cy="52" r="44" fill="none" stroke="rgba(255,255,255,.07)" strokeWidth="7" />
                    <circle cx="52" cy="52" r="44" fill="none" stroke={hungerColor} strokeWidth="7"
                      strokeLinecap="round" strokeDasharray="276"
                      strokeDashoffset={276 - 276 * hungerPct} />
                  </svg>
                  <div className="num">{health ? health.hunger.value : '--'}</div>
                </div>
                <div className="lbl">{health ? health.hunger.label : '—'}</div>
              </div>
              <div className="life-card">
                <h3>TOKEN 饭钱</h3>
                <div className="life-money">
                  <div className="big">
                    {health && health.wallet.balance !== null ? health.wallet.balance.toFixed(2) : '--'}
                    <i>元</i>
                  </div>
                  <div className="note">{health ? health.wallet.note : '—'}</div>
                </div>
              </div>
            </div>

            <div className="life-card life-bars">
              <h3>神经递质 / 激素</h3>
              {(health ? health.neuro : []).map((n) => (
                <div className="life-bar" key={n.name}>
                  <div className="name">{n.name}</div>
                  <div className="track">
                    <div className="fill" style={{ width: n.v + '%', background: n.color }} />
                  </div>
                  <div className="val">{n.v}</div>
                </div>
              ))}
            </div>

            <div className="life-card life-mood">
              <div className="life-avatar" />
              <div className="info">
                <b>{health ? health.status.mood : '平静'}</b>
                <span>最近看到 · {health ? health.saw.name : '—'}</span>
              </div>
              <button className="life-btn" style={{ marginLeft: 'auto' }} onClick={feed}>🍰</button>
            </div>
          </div>
        </section>

        <section className={'life-view' + (view === 'chat' ? ' on' : '')}>
          <div className="life-stage">
            <div className="life-charbg">
              <div className="life-call">
                <div className="aur" />
                <div className="tag"><i />视频通话中</div>
                <div className="portrait">
                  <svg viewBox="0 0 120 120" width="100%" height="100%" aria-hidden="true">
                    <defs>
                      <linearGradient id="hair" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" stopColor="#8fd0f5" />
                        <stop offset="1" stopColor="#3f74c8" />
                      </linearGradient>
                      <linearGradient id="skin" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" stopColor="#fdf6f2" />
                        <stop offset="1" stopColor="#e8d3cc" />
                      </linearGradient>
                      <linearGradient id="dress" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" stopColor="#26365f" />
                        <stop offset="1" stopColor="#101a33" />
                      </linearGradient>
                    </defs>
                    <ellipse cx="60" cy="52" rx="34" ry="36" fill="url(#hair)" />
                    <path d="M30 52 q-8 22 4 34 q-16 -8 -14 -34z" fill="#3f74c8" opacity="0.9" />
                    <path d="M90 52 q8 22 -4 34 q16 -8 14 -34z" fill="#3f74c8" opacity="0.9" />
                    <ellipse cx="60" cy="58" rx="22" ry="24" fill="url(#skin)" />
                    <path d="M38 46 q22 -20 44 0 q-4 -20 -22 -20 q-18 0 -22 20z" fill="#8fd0f5" />
                    <circle cx="52" cy="60" r="2.4" fill="#2b3a5c" />
                    <circle cx="68" cy="60" r="2.4" fill="#2b3a5c" />
                    <path d="M55 70 q5 4 10 0" stroke="#c98b8b" strokeWidth="1.6" fill="none" strokeLinecap="round" />
                    <path d="M34 84 q26 -12 52 0 l6 30 q-32 10 -64 0z" fill="url(#dress)" />
                    <path d="M46 84 q14 8 28 0" stroke="#4a6ea8" strokeWidth="2" fill="none" />
                    <circle cx="60" cy="92" r="3" fill="#f6c04a" />
                  </svg>
                </div>
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
              <div className="life-sub">
                <span className="who">大肥鱼</span>{sending ? '正在想说…' : say}
              </div>
            </div>
            <div className="life-dock">
              <button className={'life-btn' + (speakOn ? ' on' : '')} title="朗读回复"
                onClick={() => setSpeakOn((v) => !v)}>{speakOn ? '🔊' : '🔇'}</button>
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
