// 聊天页顶部人物立绘
//
// 后端的角色表目前没有 background 字段，所以立绘先在前端按角色名配置；
// 以后后端加了 character.background，会优先用后端的值（见 resolveBanner）。
//
// 字段：
// - src：图片地址，放在 frontend/public/banners/ 下就写 '/banners/文件名'
// - faceY：脸（眼睛那条线）在原图里的高度 ÷ 原图宽度。填了它，立绘会按聊天区宽度自动对准脸部；
//   不填就按桌面版的 background-position: center 8% 显示。
//   为什么需要它：8% 是按桌面窗口宽度（约 560px）调的，网页聊天区更宽时图片放大得更多，
//   同样的 8% 会把脸压到底部渐变里
//
// 图片加载失败（比如文件还没放进 public/banners/）时自动显示默认背景，不会出现破图
export const CHARACTER_BANNERS = {
  // 立绘取自桌面版 pic/background/丝柯克_bg.png，裁掉下半部分后另存为 jpg
  丝柯克: { src: '/banners/skirk.jpg', faceY: 0.35 },
}

export function resolveBanner(character) {
  if (!character) return null
  if (character.background) return { src: character.background }
  return CHARACTER_BANNERS[character.name] || null
}
