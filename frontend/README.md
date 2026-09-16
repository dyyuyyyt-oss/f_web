# AI 角色扮演聊天 - 前端

基于 Vite + React + Tailwind CSS 构建的现代化 AI 聊天前端应用。

## 功能特性

- ✨ 实时流式聊天显示
- 🎭 角色选择切换
- 📱 响应式设计，适配各种屏幕
- 🎨 现代化 UI 设计（Tailwind CSS）
- 🔄 SSE 流式响应处理
- 🌐 后端代理配置，避免跨域问题

## 快速开始

### 前置要求

- Node.js 16+
- npm 或 yarn

### 安装依赖

```bash
cd frontend
npm install
```

### 开发服务器

```bash
npm run dev
```

访问 http://localhost:5173 查看应用

### 生产构建

```bash
npm run build
```

构建后的文件在 `dist/` 目录

## 项目结构

```
frontend/
├── src/
│   ├── components/
│   │   └── ChatInterface.jsx    # 聊天界面主组件
│   ├── App.jsx                  # 应用入口
│   ├── main.jsx                 # React 入口
│   └── index.css                # 全局样式 + Tailwind
├── index.html                   # HTML 入口
├── vite.config.js               # Vite 配置（包括后端代理）
├── tailwind.config.js           # Tailwind 配置
├── postcss.config.js            # PostCSS 配置
└── package.json
```

## 配置说明

### 后端代理

在 `vite.config.js` 中配置了代理，将所有 `/api` 请求转发到 `http://127.0.0.1:8000`：

```javascript
proxy: {
  '/api': {
    target: 'http://127.0.0.1:8000',
    changeOrigin: true,
  }
}
```

### API 端点

- `GET /api/characters` - 获取角色列表
- `GET /api/chat/stream` - 流式聊天接口

## 技术栈

- **框架**: React 18
- **构建工具**: Vite 5
- **样式**: Tailwind CSS 3
- **SSE 处理**: @microsoft/fetch-event-source
- **开发工具**: ESLint, Prettier

## 浏览器支持

- Chrome (最新版)
- Firefox (最新版)
- Safari (最新版)
- Edge (最新版)

## 注意事项

- 确保后端服务在 `http://127.0.0.1:8000` 运行
- 后端 CORS 已配置允许来自 `http://localhost:5173` 的请求
- 流式聊天依赖 Server-Sent Events (SSE) 技术

## 构建生产应用

```bash
npm run build
npm run preview
```

## 许可证

MIT
