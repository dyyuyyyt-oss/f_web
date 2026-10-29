/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      // 桌面版暗色视觉的色板（与桌面版逐字一致）。组件里统一用 bg-desk-panel、text-desk-text-dim 这类类名，
      // 不散落硬编码色值；名字和桌面版的 CSS 变量一一对应（--panel-soft → desk-panel-soft）
      colors: {
        desk: {
          bg: '#101426',
          panel: '#151b31',
          'panel-soft': '#1b2340', // 聊天区底色
          header: '#1d2750', // 顶栏
          control: '#1b2547', // 输入框 / 按钮
          'control-hover': '#26325c',
          divider: '#242e52',
          accent: '#e94560', // 玫红：角色名、强调、停止
          'accent-hover': '#ff5c78',
          green: '#4ecca3', // 发送按钮
          'green-hover': '#63e0b7',
          'on-green': '#08221a', // 发送按钮上的文字
          purple: '#9b59b6',
          text: '#eef2ff',
          'text-dim': '#8d97b8',
          'text-faint': '#5f6884',
          'user-name': '#4ecca3', // "你" 的颜色
          'ai-name': '#ff7b93', // 角色名颜色
          'code-bg': '#101731',
          'code-text': '#9fe8c8',
        },
      },
      // 圆角：外层 16px（rounded-2xl）、内容块 12px（rounded-xl）、按钮 9px、代码块 10px
      borderRadius: {
        btn: '9px',
        code: '10px',
      },
      fontFamily: {
        desk: ['"Microsoft YaHei UI"', '"PingFang SC"', '"Segoe UI"', 'system-ui', 'sans-serif'],
      },
      // 角色没有立绘时的默认横幅：顶栏色到面板色的渐变，点缀紫色和玫红的光晕（颜色取自上面的色板）
      backgroundImage: {
        'desk-banner':
          'radial-gradient(circle at 18% 35%, rgba(155, 89, 182, 0.35), transparent 42%), ' +
          'radial-gradient(circle at 82% 20%, rgba(233, 69, 96, 0.22), transparent 38%), ' +
          'linear-gradient(160deg, #1d2750 0%, #151b31 100%)',
      },
      // 流式输出末尾的闪烁光标：1 秒一个周期，亮暗交替
      keyframes: {
        'cursor-blink': {
          '0%, 49%': { opacity: '1' },
          '50%, 100%': { opacity: '0' },
        },
      },
      animation: {
        'cursor-blink': 'cursor-blink 1s linear infinite',
      },
    },
  },
  plugins: [],
}
