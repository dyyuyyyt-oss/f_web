import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { authFetch } from '../api/http'
import './ops.css'

const MENU = [
  { k: 'chat', l: '对话', p: '/chat', d: 'AI 对话' },
  { k: 'group', l: '群聊', p: '/group', d: '多角色' },
  { k: 'life', l: '生活面板', p: '/life', d: '大肥鱼' },
  { k: 'aibox', l: 'AI 盒子', p: '/aibox', d: '角色工坊' },
  { k: 'home', l: '功能大厅', p: '/hall', d: '全部功能' },
  { k: 'admin', l: '设置', p: '/admin', d: '后台' },
]

export default function NeuralHomePage() {
  const nav = useNavigate()
  const { user, logout } = useAuth()
  const [stat, setStat] = useState({ mem: 0, v: null, spot: '', act: '' })
  const [entry, setEntry] = useState('/haloflux/lab.html')
  const box = useRef(null)

  useEffect(() => {
    const pick = () => {
      const touch = matchMedia('(pointer: coarse)').matches || innerWidth < 820
      setEntry(touch ? '/haloflux/mobile.html' : '/haloflux/lab.html')
    }
    pick()
    addEventListener('resize', pick)
    return () => removeEventListener('resize', pick)
  }, [])

  useEffect(() => {
    let alive = true
    const load = async () => {
      const o = { mem: 0, v: null, spot: '', act: '' }
      try {
        const [m, v, s] = await Promise.all([
          authFetch('/api/life/memory'), authFetch('/api/life/vitals'), authFetch('/api/life/space'),
        ])
        if (m.ok) o.mem = (await m.json()).total || 0
        if (v.ok) o.v = await v.json()
        if (s.ok) { const sj = await s.json(); o.spot = sj.spot_name || ''; o.act = sj.act || '' }
      } catch (e) {}
      if (alive) setStat(o)
    }
    load()
    const t = setInterval(load, 30000)
    return () => { alive = false; clearInterval(t) }
  }, [])

  const v = stat.v
  const d = v ? v.derived : null

  return (
    <div className="ops-root">
      <iframe ref={box} className="ops-frame" src={entry} title="haloflux" scrolling="no" />

      <div className="ops-veil" />

      <header className="ops-head">
        <div className="ops-title">AGENT OPS <i>/</i> DISPATCH CENTER</div>
        <div className="ops-sub">大肥鱼 · DIGITAL LIFE · MEM {stat.mem}</div>
      </header>

      <div className="ops-strip">
        <span><b>{stat.mem || '—'}</b>记忆</span>
        <span><b>{d ? Math.round(d.energy * 100) : '—'}</b>精力</span>
        <span><b>{d ? Math.round(d.mood * 100) : '—'}</b>心情</span>
        <span><b>{stat.spot || '—'}</b>{stat.act || '位置'}</span>
      </div>

      <nav className="ops-rail">
        {MENU.map((m) => (
          <button key={m.k} className="ops-btn" onClick={() => nav(m.p)}>
            <span className="ops-bl">{m.l}</span>
            <span className="ops-bd">{m.d}</span>
          </button>
        ))}
        <button className="ops-btn ops-quit" onClick={() => { logout(); nav('/login') }}>
          <span className="ops-bl">退出登录</span>
          <span className="ops-bd">{user?.username || 'USER'}</span>
        </button>
      </nav>

      <div className="ops-credit">
        visual · HALOFLUX by Ryder191（非商业授权） · <a href="https://github.com/Ryder191/haloflux" target="_blank" rel="noreferrer">来源</a>
      </div>
    </div>
  )
}
