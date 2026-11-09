import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { FEATURES } from '../config/features'
import './neural.css'

const MENU = [
  { key: 'chat', label: '对话', path: '/chat', desc: 'AI 对话' },
  { key: 'group', label: '群聊', path: '/group', desc: '多角色群聊' },
  { key: 'life', label: '生活面板', path: '/life', desc: '大肥鱼' },
  { key: 'aibox', label: 'AI 盒子', path: '/aibox', desc: '角色工坊' },
  { key: 'home', label: '功能大厅', path: '/hall', desc: '全部功能' },
]

export default function NeuralHomePage() {
  const cv = useRef(null)
  const nav = useNavigate()

  useEffect(() => {
    const canvas = cv.current
    const ctx = canvas.getContext('2d')
    let w = 0, h = 0, raf = 0
    const DPR = Math.min(window.devicePixelRatio || 1, 2)
    const nodes = []
    const pulses = []
    const resize = () => {
      const rect = canvas.parentElement.getBoundingClientRect()
      w = rect.width; h = rect.height
      canvas.width = w * DPR; canvas.height = h * DPR
      canvas.style.width = w + 'px'; canvas.style.height = h + 'px'
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0)
      nodes.length = 0
      const n = Math.max(46, Math.min(110, Math.floor((w * h) / 16000)))
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

      ctx.save()
      ctx.translate(cx, cy)
      for (let k = 0; k < 3; k++) {
        ctx.beginPath()
        ctx.strokeStyle = 'rgba(80,220,200,' + (0.05 - k * 0.012) + ')'
        ctx.lineWidth = 1
        ctx.arc(0, 0, 90 + k * 70 + Math.sin(t * 2 + k) * 6, t + k, t + k + Math.PI * 1.5)
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

      if (Math.random() < 0.14) {
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
        <div><b>在线</b><span>deepseek-flash</span></div>
        <div><b>记忆</b><span>语义检索</span></div>
        <div><b>状态</b><span>12 项生理</span></div>
      </div>

      <nav className="neural-rail">
        {MENU.map((m) => (
          <button key={m.key} className="rail-btn" onClick={() => nav(m.path)}>
            <span className="rail-label">{m.label}</span>
            <span className="rail-desc">{m.desc}</span>
          </button>
        ))}
      </nav>

      <div className="neural-foot">
        {FEATURES.slice(0, 4).map((f) => (
          <span key={f.id}>{f.title}</span>
        ))}
      </div>
    </div>
  )
}
