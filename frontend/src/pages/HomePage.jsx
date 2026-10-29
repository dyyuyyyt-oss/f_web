import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { visibleFeatures } from '../config/features'

function StatusBadge({ ready }) {
  return ready ? (
    <span className="shrink-0 rounded-full bg-desk-green/10 px-2 py-0.5 text-[11px] font-semibold text-desk-green">
      可用
    </span>
  ) : (
    <span className="shrink-0 rounded-full bg-desk-control px-2 py-0.5 text-[11px] font-semibold text-desk-text-faint">
      敬请期待
    </span>
  )
}

function FeatureCard({ feature }) {
  const ready = feature.status === 'ready'
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span
          aria-hidden="true"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-desk-control text-2xl"
        >
          {feature.icon}
        </span>
        <StatusBadge ready={ready} />
      </div>
      <h2 className="mt-4 text-base font-bold text-desk-text">{feature.title}</h2>
      <p className="mt-1 text-sm text-desk-text-dim">{feature.desc}</p>
    </>
  )

  const base = 'block rounded-2xl border border-desk-divider bg-desk-panel p-5'

  // 敬请期待：整卡置灰、不可点，也不进入键盘焦点顺序
  if (!ready) {
    return (
      <div aria-disabled="true" className={`${base} cursor-not-allowed opacity-50`}>
        {body}
      </div>
    )
  }

  return (
    <Link
      to={feature.to}
      className={`${base} transition-colors hover:border-desk-accent/60 hover:bg-desk-panel-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-desk-accent`}
    >
      {body}
    </Link>
  )
}

// 功能大厅：登录后的落地页，卡片来自 config/features.js，并按当前账号角色过滤
export default function HomePage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const features = visibleFeatures(user.role)

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-dvh bg-desk-bg font-desk text-desk-text">
      <header className="flex h-14 items-center justify-between border-b border-desk-divider bg-desk-header px-5">
        <h1 className="whitespace-nowrap text-[17px] font-bold text-white">征</h1>
        <button
          type="button"
          onClick={handleLogout}
          className="rounded-btn px-3 py-1.5 text-sm font-semibold text-desk-accent transition-colors hover:bg-desk-control hover:text-desk-accent-hover"
        >
          退出
        </button>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-8">
        <p className="text-xl font-bold">欢迎回来，{user.username}</p>
        <p className="mt-1 text-sm text-desk-text-dim">选择一个功能开始</p>

        <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <FeatureCard key={feature.id} feature={feature} />
          ))}
        </div>
      </main>
    </div>
  )
}
