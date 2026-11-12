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
  { k: 'admin', l: '设置', p: '/admin', d: '后台', admin: true },
]

export default function NeuralHomePage() {
  const nav = useNavigate()
  const { user, logout } = useAuth()
  const [stat, setStat] = useState({ mem: 0 })
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
      const o = { mem: 0 }
      try {
        const [m, s] = await Promise.all([
          authFetch('/api/life/memory'), authFetch('/api/life/space'),
        ])
        if (m.ok) o.mem = (await m.json()).total || 0
        void s
      } catch (e) {}
      if (alive) setStat(o)
    }
    load()
    const t = setInterval(load, 30000)
    return () => { alive = false; clearInterval(t) }
  }, [])

  return (
    <div className="ops-root">
      <iframe ref={box} className="ops-frame" src={entry} title="haloflux" scrolling="no" />

      <div className="ops-veil" />

      <nav className="ops-rail">
        {MENU.filter((m) => !m.admin || user?.role === 'admin').map((m) => (
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

      <div className="ops-credit">MEM {stat.mem} · 
        visual · HALOFLUX by Ryder191（非商业授权） · <a href="https://github.com/Ryder191/haloflux" target="_blank" rel="noreferrer">来源</a>
      </div>
    </div>
  )
}
