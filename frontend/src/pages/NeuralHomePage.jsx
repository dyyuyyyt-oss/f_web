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
  const [stat, setStat] = useState({ mem: 0, activity: '', mood: '', topic: '' })
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
    let timer
    const load = async () => {
      const o = { mem: 0, activity: '', mood: '', topic: '' }
      try {
        const results = await Promise.allSettled([
          authFetch('/api/life/memory'), authFetch('/api/life/space'),
          authFetch('/api/life/vitals'), authFetch('/api/life/history?limit=40'),
        ])
        const [m, s, v, h] = results.map((result) => result.status === 'fulfilled' ? result.value : null)
        if (m?.ok) o.mem = (await m.json()).total || 0
        if (s?.ok) {
          const space = await s.json()
          o.activity = [space.spot_name, space.act].filter(Boolean).join(' · ')
        }
        if (v?.ok) {
          const vitals = await v.json()
          o.mood = vitals.labels?.label_mood || ''
        }
        if (h?.ok) {
          const history = await h.json()
          const lastUserMessage = [...(history.messages || [])].reverse().find((item) => item.role === 'user')
          o.topic = lastUserMessage?.content || ''
        }
      } catch (e) {}
      if (alive) setStat(o)
      if (alive) timer = setTimeout(load, 30000)
    }
    load()
    return () => { alive = false; clearTimeout(timer) }
  }, [])

  return (
    <div className="ops-root">
      <iframe ref={box} className="ops-frame" src={entry} title="haloflux" scrolling="no" />

      <div className="ops-veil" />

      <aside className="ops-return-card" aria-label="大肥鱼近况">
        <span className="ops-return-eyebrow">大肥鱼 · 近况</span>
        <strong>{stat.activity || '还没有今天的活动记录'}</strong>
        <span>{stat.mood ? `状态：${stat.mood}` : '状态尚未读取'}</span>
        <span className="ops-return-topic">上次聊到：{stat.topic ? stat.topic.slice(0, 44) : '还没有聊天记录'}</span>
        <div>
          <button onClick={() => nav('/life?view=chat')}>继续聊天</button>
          <button onClick={() => nav('/life?view=space')}>看看她在做什么</button>
        </div>
      </aside>

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
