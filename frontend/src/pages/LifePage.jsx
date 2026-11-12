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
const MEMORY_KINDS = [
  ['', '全部类型'], ['fact', '事实'], ['emotion', '情绪'], ['preference', '偏好'],
  ['promise', '承诺'], ['event', '事件'], ['quote', '原话'], ['boundary', '底线'], ['topic', '话题'],
]

export default function LifePage() {
  const [view, setView] = useState(() => {
    const requested = new URLSearchParams(window.location.search).get('view')
    return VIEWS.some((item) => item.key === requested) ? requested : 'stars'
  })
  const [stats, setStats] = useState({ memories: 0, episodes: 0, days: 0, relations: 0 })
  const [memoryQuery, setMemoryQuery] = useState('')
  const [memoryKind, setMemoryKind] = useState('')
  const [memoryHistory, setMemoryHistory] = useState(false)
  const [memoryLayout, setMemoryLayout] = useState('stars')
  const [selectedMemory, setSelectedMemory] = useState(null)
  const [say, setSay] = useState('…')
  const [msgs, setMsgs] = useState([])
  const [historyCursor, setHistoryCursor] = useState(null)
  const [historyHasMore, setHistoryHasMore] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState('')
  const [chatError, setChatError] = useState('')
  const [chatStatus, setChatStatus] = useState('文字交流')
  const [speakOn, setSpeakOn] = useState(true)
  const [voice, setVoice] = useState('zh-CN-XiaoyiNeural')
  const [voices, setVoices] = useState([])
  const [vitals, setVitals] = useState(null)
  const [space, setSpace] = useState(null)
  const [stateErrors, setStateErrors] = useState({ vitals: '', space: '' })
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
  const audioCtxRef = useRef(null)
  const analyserRef = useRef(null)
  const voiceRafRef = useRef(0)
  const [voiceLevel, setVoiceLevel] = useState(0)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const sendingRef = useRef(false)
  const nearBottomRef = useRef(true)
  const preserveScrollRef = useRef(null)

  const canvasRef = useRef(null)
  const hintRef = useRef(null)
  const dataRef = useRef({ nodes: [], edges: [] })
  const projectRef = useRef(null)
  const sizeRef = useRef({ w: 0, h: 0 })
  const rotRef = useRef(0)

  /* ---------------- 数据 ---------------- */
  const loadHealth = useCallback(async () => {
    try {
      const results = await Promise.allSettled([
        authFetch('/api/life/vitals'), authFetch('/api/life/space'),
      ])
      if (results[0].status === 'fulfilled' && results[0].value.ok) {
        try { setVitals(await results[0].value.json()); setStateErrors((old) => ({ ...old, vitals: '' })) }
        catch (e) { setStateErrors((old) => ({ ...old, vitals: '状态读取失败' })) }
      } else setStateErrors((old) => ({ ...old, vitals: '状态读取失败' }))
      if (results[1].status === 'fulfilled' && results[1].value.ok) {
        try { setSpace(await results[1].value.json()); setStateErrors((old) => ({ ...old, space: '' })) }
        catch (e) { setStateErrors((old) => ({ ...old, space: '空间信息读取失败' })) }
      } else setStateErrors((old) => ({ ...old, space: '空间信息读取失败' }))
    } catch (e) { /* keep last valid data */ }
  }, [])

  const loadHistory = useCallback(async (beforeId = null) => {
    if (historyLoading) return
    setHistoryLoading(true)
    setHistoryError('')
    try {
      const query = beforeId ? `?before_id=${beforeId}&limit=40` : '?limit=40'
      const r = await authFetch('/api/life/history' + query)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const d = await r.json()
      const loaded = (d.messages || []).map((m) => ({
        id: m.id, role: m.role === 'user' ? 'user' : 'bot', text: m.content || '',
        createdAt: m.created_at, status: 'sent',
      }))
      if (beforeId) {
        const el = logRef.current
        preserveScrollRef.current = el ? { height: el.scrollHeight, top: el.scrollTop } : null
        setMsgs((current) => [...loaded, ...current.filter((m) => !loaded.some((n) => n.id === m.id))])
      } else {
        setMsgs(loaded)
        if (loaded.length) setSay(loaded[loaded.length - 1].text)
      }
      setHistoryCursor(d.next_cursor)
      setHistoryHasMore(Boolean(d.has_more))
    } catch (e) {
      setHistoryError('聊天记录加载失败，请重试。')
    } finally {
      setHistoryLoading(false)
    }
  }, [historyLoading])

  useEffect(() => { loadHistory() }, [])

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
    let alive = true
    let active = false
    let timer
    const refresh = async () => {
      if (active || !alive) return
      active = true
      try { if (!document.hidden) await loadHealth() }
      finally {
        active = false
        if (alive) timer = setTimeout(refresh, 30000)
      }
    }
    const onVisible = () => {
      if (!document.hidden) {
        clearTimeout(timer)
        refresh()
      }
    }
    refresh()
    document.addEventListener('visibilitychange', onVisible)
    return () => { alive = false; clearTimeout(timer); document.removeEventListener('visibilitychange', onVisible) }
  }, [loadHealth])

  useEffect(() => {
    let alive = true
    const timer = setTimeout(async () => {
    ;(async () => {
      try {
        const params = new URLSearchParams()
        if (memoryQuery.trim()) params.set('q', memoryQuery.trim())
        if (memoryKind) params.set('kind', memoryKind)
        if (memoryHistory) params.set('include_archived', 'true')
        const r = await authFetch('/api/life/graph?' + params.toString())
        if (!r.ok) return
        const d = await r.json()
        if (!alive) return
        dataRef.current = { nodes: d.nodes || [], edges: d.edges || [] }
        setStats(d.stats || {})
        setSelectedMemory((current) => current && (d.nodes || []).some((node) => node.id === current.id) ? current : null)
      } catch (e) { /* 忽略 */ }
    })()
    }, 250)
    return () => { alive = false; clearTimeout(timer) }
  }, [memoryQuery, memoryKind, memoryHistory])

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
    projectRef.current = project

    const draw = (t) => {
      if (document.hidden || memoryLayout !== 'stars' ||
          (!window.matchMedia('(min-width: 960px)').matches && view !== 'stars')) return
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
        if (['fact', 'preference', 'boundary', 'promise'].includes(n.kind)) { color = 'rgba(246,192,74,.95)'; r *= 1.35 * pulse }
        else if (n.kind === 'emotion') { color = 'rgba(169,139,240,.95)'; r *= 1.2 }
        else if (n.kind === 'event') color = 'rgba(94,200,242,.95)'
        else if (n.kind === 'quote') color = 'rgba(111,224,160,.9)'
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
    const onVisibility = () => {
      cancelAnimationFrame(raf)
      if (!document.hidden && memoryLayout === 'stars' &&
          (window.matchMedia('(min-width: 960px)').matches || view === 'stars')) {
        raf = requestAnimationFrame(draw)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('resize', onVisibility)
    onVisibility()

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
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('resize', onVisibility)
      projectRef.current = null
    }
  }, [view, memoryLayout])

  /* ---------------- 对话 ---------------- */
  const send = async (text = draft.trim(), requestId = null) => {
    if (!text || sendingRef.current) return
    sendingRef.current = true
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
    window.speechSynthesis?.cancel()
    const id = requestId || (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`)
    if (!requestId) setDraft('')
    setSending(true)
    setChatError('')
    setChatStatus('思考中')
    setSay('…')
    setMsgs((m) => requestId
      ? m.map((item) => item.requestId === id ? { ...item, status: 'sending' } : item)
      : m.concat([{ id: id, requestId: id, role: 'user', text, status: 'sending' }]))
    try {
      const r = await authFetch('/api/life/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, request_id: id }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok || !d.ok) throw new Error(d.detail || '服务暂时不可用')
      const reply = d.reply
      setSay(reply)
      setDraft((current) => current === text ? '' : current)
      setChatStatus('文字交流')
      setMsgs((m) => [...m.map((item) => item.requestId === id ? { ...item, status: 'sent' } : item),
        { id: `reply-${id}`, role: 'bot', text: reply, status: 'sent' }])
    } catch (e) {
      setChatStatus('连接失败')
      setChatError(e.message || '发送失败，请重试。')
      setDraft((current) => current || text)
      setMsgs((m) => m.map((item) => item.requestId === id ? { ...item, status: 'failed' } : item))
    } finally {
      sendingRef.current = false
      setSending(false)
      loadHealth()
    }
  }

  useEffect(() => {
    if (!speakOn || !say || say === '…' || sending) return
    let dead = false
    ;(async () => {
      try {
        setChatStatus('准备朗读')
        const r = await authFetch('/api/life/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: say, voice, rate: '-4%', pitch: '-6Hz' }),
        })
        if (!r.ok) throw new Error('tts ' + r.status)
        const blob = await r.blob()
        if (dead) return
        const url = URL.createObjectURL(blob)
        if (!audioRef.current) audioRef.current = new Audio()
        audioRef.current.src = url
        audioRef.current.onplay = () => setChatStatus('朗读中')
        audioRef.current.onended = () => { setChatStatus('文字交流'); URL.revokeObjectURL(url) }
        audioRef.current.onerror = () => { setChatStatus('文字交流'); URL.revokeObjectURL(url) }
        try {
          const AC = window.AudioContext || window.webkitAudioContext
          if (!audioCtxRef.current) audioCtxRef.current = new AC()
          const ac = audioCtxRef.current
          if (!analyserRef.current) {
            const srcNode = ac.createMediaElementSource(audioRef.current)
            const an = ac.createAnalyser()
            an.fftSize = 256
            srcNode.connect(an)
            an.connect(ac.destination)
            analyserRef.current = an
          }
          if (ac.state === 'suspended') await ac.resume()
          const buf = new Uint8Array(analyserRef.current.frequencyBinCount)
          const loop = () => {
            analyserRef.current.getByteFrequencyData(buf)
            let s = 0
            for (let i = 0; i < buf.length; i++) s += buf[i]
            setVoiceLevel(Math.min(1, (s / buf.length) / 70))
            voiceRafRef.current = requestAnimationFrame(loop)
          }
          loop()
          audioRef.current.onended = () => { cancelAnimationFrame(voiceRafRef.current); setVoiceLevel(0) }
        } catch (e) { /* 分析不可用不影响播放 */ }
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
      setChatStatus('文字交流')
      setInterim('')
      setRefusal('识别失败：' + (ev.error || '未知'))
    }
    rec.onend = () => { setRecording(false); setInterim(''); setChatStatus('文字交流') }
    recogRef.current = rec
    rec.start()
    setRecording(true)
    setChatStatus('正在听')
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
        setChatStatus('文字交流')
        setLevel(0)
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        setLastClip({ size: blob.size, url: URL.createObjectURL(blob), at: Date.now() })
        setDraft((d) => d || '[语音] ')
      }
      recRef.current = rec
      rec.start()
      setRecording(true)
      setChatStatus('正在听')
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
    } catch (e) { /* 声线设置失败不影响文字对话 */ }
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

  const vitalColor = (key, value) => {
    const highIsStrain = ['hunger', 'thirst', 'adenosine', 'cortisol', 'adrenaline']
    if (highIsStrain.includes(key)) return value > 0.75 ? '#f2695c' : value > 0.52 ? '#f6c04a' : '#5ec8f2'
    if (key === 'immune') return value < 0.3 ? '#f6c04a' : value > 0.62 ? '#6fe0a0' : '#5ec8f2'
    return value < 0.25 ? '#f6c04a' : value > 0.72 ? '#6fe0a0' : '#5ec8f2'
  }

  const logRef = useRef(null)
  useEffect(() => {
    const el = logRef.current
    if (!el) return
    if (preserveScrollRef.current) {
      const prior = preserveScrollRef.current
      el.scrollTop = prior.top + (el.scrollHeight - prior.height)
      preserveScrollRef.current = null
    } else if (nearBottomRef.current) el.scrollTop = el.scrollHeight
  }, [msgs, sending])

  const handleLogScroll = (event) => {
    const el = event.currentTarget
    nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48
  }

  const handleStarClick = (event) => {
    const cv = canvasRef.current
    const project = projectRef.current
    if (!cv || !project) return
    const rect = cv.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    const R = Math.min(sizeRef.current.w, sizeRef.current.h * 1.5) * 0.46
    let closest = null
    let distance = 16
    for (const node of dataRef.current.nodes) {
      const point = project(node, R)
      const current = Math.hypot(point.x - x, point.y - y)
      if (current < distance) { closest = node; distance = current }
    }
    setSelectedMemory(closest)
  }

  return (
    <div className="life-root">
      <header className="life-header">
        <span className="dot" /> 大肥鱼
        <span className="sub">{new Date().toTimeString().slice(0, 5)}</span>
        <button className="life-back" onClick={() => navigate('/')}>← 返回控制台</button>
      </header>

      <main className="life-main">
        <section className={'life-view' + (view === 'stars' ? ' on' : '')}>
          <div className="life-memory-tools">
            <input aria-label="搜索记忆" value={memoryQuery} onChange={(e) => setMemoryQuery(e.target.value)} placeholder="搜索记忆…" />
            <select aria-label="筛选记忆类型" value={memoryKind} onChange={(e) => setMemoryKind(e.target.value)}>
              {MEMORY_KINDS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <label><input type="checkbox" checked={memoryHistory} onChange={(e) => setMemoryHistory(e.target.checked)} />历史</label>
            <button className={memoryLayout === 'stars' ? 'on' : ''} onClick={() => setMemoryLayout('stars')}>星图</button>
            <button className={memoryLayout === 'list' ? 'on' : ''} onClick={() => setMemoryLayout('list')}>列表</button>
          </div>
          <canvas id="life-stars" ref={canvasRef} onClick={handleStarClick}
            style={{ display: memoryLayout === 'stars' ? 'block' : 'none', cursor: 'pointer' }} />
          {memoryLayout === 'list' && (
            <div className="life-memory-list" aria-live="polite">
              {dataRef.current.nodes.map((node) => (
                <button key={node.id} onClick={() => setSelectedMemory(node)}>
                  <strong>{node.kind} · {new Date((node.created_at || 0) * 1000).toLocaleDateString('zh-CN')}</strong>
                  <span>{node.text}</span>
                  {node.archived || node.superseded_by ? <small>历史记录</small> : null}
                </button>
              ))}
              {!dataRef.current.nodes.length && <p>没有找到符合条件的记忆。</p>}
            </div>
          )}
          {selectedMemory && (
            <article className="life-memory-detail">
              <button className="life-memory-close" aria-label="关闭记忆详情" onClick={() => setSelectedMemory(null)}>×</button>
              <strong>{MEMORY_KINDS.find(([value]) => value === selectedMemory.kind)?.[1] || selectedMemory.kind}</strong>
              <p>{selectedMemory.text}</p>
              <small>重要性 {Math.round((selectedMemory.importance || 0) * 100)}% · 来源未关联 · {new Date((selectedMemory.created_at || 0) * 1000).toLocaleString('zh-CN')}</small>
              {selectedMemory.archived || selectedMemory.superseded_by ? <small>已归档或被后续条目取代，原文保留</small> : null}
            </article>
          )}
          <div className="life-stats">
            <div className="life-stat"><b>{stats.memories}</b><span>记忆</span></div>
            <div className="life-stat"><b>{stats.episodes}</b><span>事件</span></div>
            <div className="life-stat"><b>{stats.days}</b><span>天</span></div>
            <div className="life-stat"><b>{stats.relations}</b><span>关系</span></div>
          </div>
          <div className="life-curve">
            <h4>遗忘机制示意</h4>
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
          <div className="life-tip">来自真实记忆条目 · 点选节点查看详情</div>
        </section>

        <section className={'life-view' + (view === 'health' ? ' on' : '')}>
          <div className="life-health">
            {stateErrors.vitals && <div className="life-state-error" role="status">{stateErrors.vitals} · 显示最近一次可用数据</div>}
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
              <h3>模拟生理状态 · 非医学测量</h3>
              {(vitals ? vitals.bars : []).map((b) => (
                <div className="life-bar" key={b.key}>
                  <div className="name">{b.name}</div>
                  <div className="track">
                    <div className="fill" style={{ width: (b.v * 100).toFixed(0) + '%', background: vitalColor(b.key, b.v) }} />
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
              <b>{space ? space.spot_name + ' · ' + space.act : (stateErrors.space || '正在读取空间状态…')}</b>
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
                <div className="tag"><i />文字交流</div>
                
                <div className="meta"><b>大肥鱼</b><span aria-live="polite">{chatStatus}</span></div>
                <div className="life-wave">
                  {Array.from({ length: 22 }).map((_, i) => {
                    const shape = 0.35 + 0.65 * Math.abs(Math.sin(i * 0.9))
                    return (
                      <span
                        key={i}
                        style={{
                          height: (6 + voiceLevel * 26 * shape).toFixed(1) + 'px',
                          animation: voiceLevel > 0.02 ? 'none' : undefined,
                          animationDelay: (i * 0.07).toFixed(2) + 's',
                        }}
                      />
                    )
                  })}
                </div>
              </div>
              <div className="life-log" ref={logRef} onScroll={handleLogScroll}>
                {historyHasMore && (
                  <button className="life-history-more" disabled={historyLoading}
                    onClick={() => historyCursor && loadHistory(historyCursor)}>
                    {historyLoading ? '正在加载…' : '加载更早的消息'}
                  </button>
                )}
                {historyError && <div className="life-inline-error" role="alert">{historyError} <button onClick={() => loadHistory(historyCursor)}>重试</button></div>}
                {historyLoading && !msgs.length && <div className="life-empty">正在加载聊天记录…</div>}
                {!historyLoading && !msgs.length && !historyError && <div className="life-empty">还没有聊天记录，和大肥鱼说句话吧。</div>}
                {msgs.map((m, i) => (
                  <div key={m.id ?? `${m.requestId ?? m.role}-${i}`} className={'life-bubble ' + (m.role === 'user' ? 'me' : 'bot')}>
                    <span>{m.text}</span>
                    {m.status === 'sending' && <small className="life-message-state">发送中…</small>}
                    {m.status === 'failed' && <div className="life-message-actions">
                      <small className="life-message-state">发送失败</small>
                      <button onClick={() => send(m.text, m.requestId)}>重试</button>
                      <button onClick={() => navigator.clipboard?.writeText(m.text)}>复制</button>
                    </div>}
                  </div>
                ))}
              </div>
              {chatError && <div className="life-chat-error" role="alert">{chatError}</div>}
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
              <button className="life-btn main" onClick={() => send()} disabled={sending || !draft.trim()} aria-label="发送消息">↑</button>
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
