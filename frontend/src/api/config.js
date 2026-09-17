// 后端 API 基础地址配置
//
// 本地开发时留空即可：请求走相对路径 /api/...，由 vite.config.js 里配置的开发代理
// 转发到 127.0.0.1:8000。
//
// 部署到 Vercel 等静态托管平台时，构建产物是纯静态文件，没有开发代理，
// 必须在部署平台的环境变量中设置 VITE_API_BASE_URL 为真实后端地址
// （例如部署在 Render 上的 https://xxx.onrender.com），否则前端请求不到任何数据。
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''

/**
 * 将相对路径（如 /api/characters、/api/uploads/avatars/xxx.jpg）
 * 解析为可访问的完整地址；已经是完整 URL（http/https 开头）的原样返回
 * @param {string} path 相对路径或完整 URL
 * @returns {string} 可直接请求 / 用作 <img src> 的地址
 */
export function resolveApiUrl(path) {
  if (!path) return path
  if (/^https?:\/\//.test(path)) return path
  return `${API_BASE_URL}${path}`
}
