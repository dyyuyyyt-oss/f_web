import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { authFetch } from '../api/http'
import './ops.css'

const MENU = [
  { k: 'chat', l: '对话', p: '/chat' }, { k: 'group', l: '群聊', p: '/group' },
  { k: 'life', l: '生活面板', p: '/life' }, { k: 'aibox', l: 'AI 盒子', p: '/aibox' },
  { k: 'home', l: '功能大厅', p: '/hall' }, { k: 'admin', l: '设置', p: '/admin' },
]

const LOG_LINES = [
  'FETCH  CHECK COVER ART EXPLORATION', 'FETCH  FETCH LIVE STREAM HIGHLIGHTS',
  'FETCH  FETCH ADS VECTOR BUILDERS', 'BUILD  BUILD BRAND METRICS ROLLUP',
  'CHECK  CHECK API ENVELOPE SYNC', 'FETCH  FETCH AGENT TELEMETRY',
  'BUILD  BUILD MEMORY EMBEDDING', 'CHECK  CHECK VITALS DRIFT',
]

export default function NeuralHomePage() {
  const cv = useRef(null)
  const nav = useNavigate()
  const { user, logout } = useAuth()
  const [stat, setStat] = useState({ mem: 0, v: null, spot: '', act: '', ticks: 0 })
  const ref = useRef({ mem: 0, v: null, spot: '', act: '', ticks: 0 })

  useEffect(() => {
    let alive = true
    const load = async () => {
      const o = { mem: 0, v: null, spot: '', act: '', ticks: 0 }
      try {
        const [m, v, s] = await Promise.all([
          authFetch('/api/life/memory'), authFetch('/api/life/vitals'), authFetch('/api/life/space'),
        ])
        if (m.ok) o.mem = (await m.json()).total || 0
        if (v.ok) o.v = await v.json()
        if (s.ok) { const sj = await s.json(); o.spot = sj.spot_name || ''; o.act = sj.act || '' }
      } catch (e) {}
      o.ticks = (ref.current.ticks || 0) + 1
      if (alive) { ref.current = o; setStat(o) }
    }
    load()
    const t1 = setInterval(load, 30000)
    const t2 = setInterval(() => {
      const o = { ...ref.current, ticks: (ref.current.ticks || 0) + 1 }
      ref.current = o; setStat(o)
    }, 1200)
    return () => { alive = false; clearInterval(t1); clearInterval(t2) }
  }, [])

  useEffect(() => {
    const c = cv.current
    const ctx = c.getContext('2d')
    let w = 0, h = 0, raf = 0
    const low = (navigator.hardwareConcurrency || 4) <= 4 || window.innerWidth < 700
    const DPR = low ? 1 : Math.min(devicePixelRatio || 1, 1.5)
    const nodes = [], streams = []
    const resize = () => {
      const r = c.parentElement.getBoundingClientRect()
      w = r.width; h = r.height
      c.width = w * DPR; c.height = h * DPR
      c.style.width = w + 'px'; c.style.height = h + 'px'
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0)
      nodes.length = 0
      const n = Math.max(28, Math.min(80, Math.floor(w * h / 26000) + Math.min(20, ref.current.mem)))
      for (let i = 0; i < n; i++) nodes.push({
        a: Math.random() * Math.PI * 2, rad: 90 + Math.random() * 190,
        sp: (0.0015 + Math.random() * 0.004) * (Math.random() > 0.5 ? 1 : -1),
        r: 1 + Math.random() * 1.6, pink: Math.random() > 0.85,
      })
      streams.length = 0
      const rows = Math.floor(h / 14)
      for (let i = 0; i < rows; i++) streams.push({ y: i * 14 + 6, len: 4 + Math.floor(Math.random() * 10), sp: 0.6 + Math.random() * 2.4, off: Math.random() * 40 })
    }
    resize()
    addEventListener('resize', resize)

    let t = 0
    const draw = () => {
      t += 0.012
      ctx.clearRect(0, 0, w, h)
      const cx = w * 0.34, cy = h * 0.46, R = Math.min(w, h) * 0.42
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.6)
      g.addColorStop(0, 'rgba(10,50,60,.55)'); g.addColorStop(.5, 'rgba(4,14,22,.85)'); g.addColorStop(1, 'rgba(2,4,8,1)')
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h)

      // 流束（右侧数据雨）
      const sx = w * 0.62
      ctx.save()
      ctx.globalAlpha = 0.5
      for (const s of streams) {
        const drift = (t * 60 * s.sp + s.off) % (w - sx)
        const x = sx + drift
        ctx.fillStyle = 'rgba(90,230,200,.5)'
        for (let k = 0; k < s.len; k++) {
          const xx = x + k * 4
          if (xx < w - 4) ctx.fillRect(xx, s.y, 2.4, 1.6)
        }
      }
      ctx.restore()

      // 中心球
      ctx.save(); ctx.translate(cx, cy)
      for (let k = 0; k < 2; k++) {
        ctx.beginPath(); ctx.strokeStyle = 'rgba(90,240,215,' + (0.16 - k * 0.06) + ')'
        ctx.lineWidth = 1; ctx.arc(0, 0, R * (0.55 + k * 0.22), 0, Math.PI * 2); ctx.stroke()
      }
      for (const n of nodes) {
        n.a += n.sp
        const x = Math.cos(n.a) * n.rad, y = Math.sin(n.a) * n.rad * 0.72
        ctx.beginPath(); ctx.strokeStyle = 'rgba(80,220,200,.16)'; ctx.lineWidth = 0.6
        ctx.moveTo(0, 0); ctx.lineTo(x, y); ctx.stroke()
        ctx.beginPath(); ctx.fillStyle = n.pink ? 'rgba(255,150,195,.9)' : 'rgba(150,245,225,.9)'
        ctx.arc(x, y, n.r, 0, 6.283); ctx.fill()
      }
      const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, 46)
      gr.addColorStop(0, 'rgba(170,255,240,.9)'); gr.addColorStop(1, 'rgba(60,220,200,0)')
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, 46 + Math.sin(t * 3) * 4, 0, 6.283); ctx.fill()
      ctx.restore()

      raf = requestAnimationFrame(draw)
    }
    draw()
    return () => { cancelAnimationFrame(raf); removeEventListener('resize', resize) }
  }, [])

  const v = stat.v
  const d = v ? v.derived : null
  const agents = MENU.map((m, i) => ({ ...m, n: String(i + 1).padStart(2, '0'), st: i === 0 ? '运行中' : (i % 3 === 0 ? '待命' : '空闲') }))

  return (
    <div className="ops-root">
      <canvas ref={cv} className="ops-canvas" />

      <header className="ops-head">
        <div className="ops-title">AGENT OPS <i>/</i> DISPATCH CENTER</div>
        <div className="ops-sub">DIGITAL LIFE · 大肥鱼 · FUEL {stat.mem} MEM</div>
      </header>

      <section className="ops-grid">
        {Array.from({ length: 18 }).map((_, i) => (
          <div className="ops-cell" key={i}>
            <span className="ops-id">AG-{String(i + 101).slice(1)}</span>
            <span className={'ops-dot' + (i % 4 === 0 ? ' hot' : '')} />
            <span className="ops-st">{i % 5 === 0 ? 'SYNC' : i % 3 === 0 ? 'IDLE' : 'RUN'}</span>
          </div>
        ))}
      </section>

      <section className="ops-gauges">
        {[['精力', d?.energy], ['心情', d?.mood], ['抗压', d ? 1 - d.stress : null]].map(([label, val]) => (
          <div className="ops-gauge" key={label}>
            <div className="ops-glabel">{label}</div>
            <div className="ops-bar"><i style={{ width: Math.round((val || 0) * 100) + '%' }} /></div>
            <div className="ops-gval">{val == null ? '--' : Math.round(val * 100)}</div>
          </div>
        ))}
        <div className="ops-where">{stat.spot || '—'} · {stat.act || '—'}</div>
      </section>

      <nav className="ops-rail">
        {MENU.map((m) => (
          <button key={m.k} className="ops-btn" onClick={() => nav(m.p)}>
            <span className="ops-bl">{m.l}</span>
            <span className="ops-bd">{m.k.toUpperCase()}</span>
          </button>
        ))}
        <button className="ops-btn ops-quit" onClick={() => { logout(); nav('/login') }}>
          <span className="ops-bl">退出登录</span>
          <span className="ops-bd">{user?.username || 'USER'}</span>
        </button>
      </nav>

      <section className="ops-panels">
        <div className="ops-panel">
          <div className="ops-ph">TASK FEED / EVENT LOG</div>
          <div className="ops-pl">
            {LOG_LINES.map((l, i) => (
              <div key={i} className="ops-li"><b>{(240 + i).toString().slice(-3)}</b>{l}</div>
            ))}
          </div>
        </div>
        <div className="ops-panel">
          <div className="ops-ph">ADVECTION / PARTICLE SOLVER</div>
          <div className="ops-pv">
            {[d?.energy, d?.mood, d ? 1 - d.stress : 0, v ? v.state.thirst : 0, v ? v.state.hunger : 0].map((x, i) => (
              <div key={i} className="ops-vrow">
                <span>{['ENERGY', 'MOOD', 'CALM', 'THIRST', 'HUNGER'][i]}</span>
                <div className="ops-vbar"><i style={{ width: Math.round((x || 0) * 100) + '%' }} /></div>
              </div>
            ))}
          </div>
        </div>
        <div className="ops-panel">
          <div className="ops-ph">AGENTS / DISPATCH</div>
          <div className="ops-pl">
            {agents.map((a) => (
              <div key={a.k} className="ops-li"><b>{a.n}</b>{a.l}<em>{a.st}</em></div>
            ))}
          </div>
        </div>
      </section>

      <footer className="ops-foot">
        <span>MEM {stat.mem}</span><span>TICK {stat.ticks}</span>
        <span>{v ? v.tags?.slice(0, 2).join(' · ') : '—'}</span>
      </footer>
    </div>
  )
}
