import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        rewrite: (path) => path,
      },
      // 聊天图片挂载在根路径 /uploads（不带 /api 前缀），本地开发也要单独代理，
      // 否则 <img src="/uploads/xxx.png"> 会被 vite 的 SPA fallback 当成页面路由处理
      '/uploads': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        rewrite: (path) => path,
      },
    },
  },
})
