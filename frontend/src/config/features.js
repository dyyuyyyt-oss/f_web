// 功能大厅的菜单数据源：新增功能只需要在这里加一条，首页会自动多一张卡片
//
// 字段说明：
// - to：点击后跳转的路由；status 为 soon 时不会跳转
// - status：ready 可用 / soon 敬请期待（整卡置灰、不可点）
// - roles：哪些角色能看到这张卡（user / admin）
export const FEATURES = [
  {
    id: 'chat',
    title: 'AI 对话',
    desc: '和丝柯克聊天，支持图片识别',
    icon: '💬',
    to: '/chat',
    status: 'ready', // ready | soon
    roles: ['user', 'admin'],
  },
  {
    id: 'group',
    title: '群聊',
    desc: '拉 2~3 个角色进群，按顺序轮流接话',
    icon: '👥',
    to: '/group',
    status: 'ready',
    roles: ['user', 'admin'],
  },
  {
    id: 'admin',
    title: '管理后台',
    desc: '用户、注册申请与数据管理',
    icon: '🛠️', // 带 VS16 变体符，否则部分系统渲染成单色字形
    to: '/admin',
    status: 'ready',
    roles: ['admin'], // 只有管理员看得到
  },
  {
    id: 'gallery',
    title: '待定功能',
    desc: '敬请期待',
    icon: '✨',
    to: '#',
    status: 'soon',
    roles: ['user', 'admin'],
  },
]

export function visibleFeatures(role) {
  return FEATURES.filter((f) => f.roles.includes(role))
}
