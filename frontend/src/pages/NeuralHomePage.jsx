import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { authFetch } from '../api/http'
import './neural.css'

const MENU = [
  { key: 'chat', label: '对话', path: '/chat', desc: 'AI 对话' },
  { key: 'group', label: '群聊', path: '/group', desc: '多角色群聊' },
  { key: 'life', label: '生活面板', path: '/life', desc: '大肥鱼' },
  { key: 'aibox', label: 'AI 盒子', path: '/aibox', desc: '角色工坊' },
  { key: 'home', label: '功能大厅', path: '/hall', desc: '全部功能' },
  { key: 'admin', label: '设置', path: '/admin', desc: '后台管理' },
]

export default function NeuralHomePage() {
  const cv = useRef(null)
  const nav = useNavigate()
  const { user, logout } = useAuth()
  const [stat, setStat] = useState({ mem: 0, vitals: null, spot: '', act: '' })
  const statRef = useRef({ mem: 0, vitals: null, spot: '', act: '' })

  useEffect(() => {
    let alive = true
    const load = async () => {
      const out = { mem: 0, vitals: null, spot: '', act: '' }
      try {
        const [m, v, s] = await Promise.all([
          authFetch('/api/life/memory'),
          authFetch('/api/life/vitals'),
          authFetch('/api/life/space'),
        ])
        if (m.ok) out.mem = (await m.json()).total || 0
        if (v.ok) out.vitals = await v.json()
        if (s.ok) { const sj = await s.json(); out.spot = sj.spot_name || ''; out.act = sj.act || '' }
      } catch (e) { /* 离线也不崩 */ }
      if (alive) { statRef.current = out; setStat(out) }
    }
    load()
    const timer = setInterval(load, 30000)
    return () => { alive = false; clearInterval(timer) }
  }, [])

  useEffect(() => {
    const canvas = cv.current
    const ctx = canvas.getContext('2d')
    let w = 0, h = 0, raf = 0
    const lowEnd = (navigator.hardwareConcurrency || 4) <= 4 || window.innerWidth < 640
    const DPR = lowEnd ? 1 : Math.min(window.devicePixelRatio || 1, 1.5)
    const nodes = []
    const pulses = []
    const resize = () => {
      const rect = canvas.parentElement.getBoundingClientRect()
      w = rect.width; h = rect.height
      canvas.width = w * DPR; canvas.height = h * DPR
      canvas.style.width = w + 'px'; canvas.style.height = h + 'px'
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0)
      nodes.length = 0
      const base = Math.max(34, Math.min(96, Math.floor((w * h) / 19000)))
      const n = Math.max(24, Math.min(120, base + Math.min(24, statRef.current.mem * 2)))
      for (let i = 0; i < n; i++) {
        nodes.push({
          x: Math.random() * w, y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.22, vy: (Math.random() - 0.5) * 0.22,
          r: 1 + Math.random() * 1.8, hue: Math.random() > 0.82 ? 'pink' : 'cyan',
        })
      }
    }
    resize()
    window.addEventListener('resize', resize)

    let t = 0
    const draw = () => {
      t += 0.006
      ctx.clearRect(0, 0, w, h)
      const cx = w * 0.36, cy = h * 0.5

      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.7)
      g.addColorStop(0, 'rgba(20,60,80,0.35)')
      g.addColorStop(0.45, 'rgba(8,20,32,0.6)')
      g.addColorStop(1, 'rgba(3,6,12,0.95)')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, w, h)

      const vit = statRef.current.vitals
      const gauges = vit && vit.derived
        ? [vit.derived.energy, vit.derived.mood, 1 - vit.derived.stress]
        : [0.5, 0.5, 0.5]
      ctx.save()
      ctx.translate(cx, cy)
      for (let k = 0; k < 3; k++) {
        const rad = 88 + k * 62
        ctx.beginPath()
        ctx.strokeStyle = 'rgba(80,220,200,0.07)'
        ctx.lineWidth = 5
        ctx.arc(0, 0, rad, 0, Math.PI * 2)
        ctx.stroke()
        const v = Math.max(0.02, Math.min(1, gauges[k]))
        ctx.beginPath()
        ctx.strokeStyle = ['rgba(110,240,218,0.75)', 'rgba(160,200,255,0.7)', 'rgba(255,150,190,0.6)'][k]
        ctx.lineWidth = 3
        ctx.arc(0, 0, rad, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * v)
        ctx.stroke()
      }
      ctx.restore()

      for (const n of nodes) {
        n.x += n.vx; n.y += n.vy
        if (n.x < 0 || n.x > w) n.vx *= -1
        if (n.y < 0 || n.y > h) n.vy *= -1
        const d = Math.hypot(n.x - cx, n.y - cy)
        if (d < 260) { n.x += (n.x - cx) / d * 0.25; n.y += (n.y - cy) / d * 0.25 }
      }

      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j]
          const dx = a.x - b.x, dy = a.y - b.y
          const dist = Math.hypot(dx, dy)
          if (dist < 132) {
            ctx.beginPath()
            ctx.strokeStyle = 'rgba(90,220,200,' + (0.18 * (1 - dist / 132)).toFixed(3) + ')'
            ctx.lineWidth = 0.6
            ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y)
            ctx.stroke()
          }
        }
      }

      for (const n of nodes) {
        ctx.beginPath()
        ctx.fillStyle = n.hue === 'pink' ? 'rgba(255,140,190,0.9)' : 'rgba(140,240,225,0.85)'
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2)
        ctx.fill()
      }

      if (Math.random() < 0.10 + Math.min(0.12, statRef.current.mem * 0.01)) {
        const a = nodes[Math.floor(Math.random() * nodes.length)]
        const b = nodes[Math.floor(Math.random() * nodes.length)]
        if (a && b) pulses.push({ a, b, p: 0 })
      }
      for (let i = pulses.length - 1; i >= 0; i--) {
        const p = pulses[i]
        p.p += 0.035
        if (p.p >= 1) { pulses.splice(i, 1); continue }
        const x = p.a.x + (p.b.x - p.a.x) * p.p
        const y = p.a.y + (p.b.y - p.a.y) * p.p
        ctx.beginPath()
        ctx.fillStyle = 'rgba(220,255,250,0.95)'
        ctx.arc(x, y, 1.8, 0, Math.PI * 2)
        ctx.fill()
      }

      raf = requestAnimationFrame(draw)
    }
    draw()
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize) }
  }, [])

  return (
    <div className="neural-root">
      <canvas ref={cv} className="neural-canvas" />

      <header className="neural-head">
        <div className="tag">AGENT OPS / 大肥鱼</div>
        <h1>数字生命 运行中</h1>
        <p>内稳态 · 记忆突触 · 空间行为 — 实时状态见右侧</p>
      </header>

      <div className="neural-stats">
        <div><b>{stat.mem || '—'}</b><span>记忆条目</span></div>
        <div><b>{stat.vitals ? Math.round(stat.vitals.derived.energy * 100) : '—'}</b><span>精力</span></div>
        <div><b>{stat.vitals ? Math.round(stat.vitals.derived.mood * 100) : '—'}</b><span>心情</span></div>
        <div><b>{stat.spot || '—'}</b><span>{stat.act || '位置'}</span></div>
      </div>

      <nav className="neural-rail">
        {MENU.map((m) => (
          <button key={m.key} className="rail-btn" onClick={() => nav(m.path)}>
            <span className="rail-label">{m.label}</span>
            <span className="rail-desc">{m.desc}</span>
          </button>
        ))}
        <button className="rail-btn rail-quit" onClick={() => { logout(); nav('/login') }}>
          <span className="rail-label">退出登录</span>
          <span className="rail-desc">{user?.username || '当前账号'}</span>
        </button>
      </nav>

      <div className="neural-foot">
        <span>memory · bge-m3</span>
        <span>vitals · 12</span>
        <span>{stat.vitals ? stat.vitals.labels.label_thirst : ''}</span>
      </div>
    </div>
  )
}
