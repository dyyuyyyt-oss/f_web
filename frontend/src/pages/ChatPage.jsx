import ChatInterface from '../components/ChatInterface'

// 聊天页（/chat）：桌面版暗色视觉。大屏上整个聊天界面像桌面窗口一样居中，外层圆角 16px；
// 小屏铺满。回功能大厅的入口在角色栏顶部
export default function ChatPage() {
  return (
    <div className="h-dvh bg-desk-bg font-desk text-desk-text lg:p-6">
      <div className="mx-auto h-full max-w-[1120px] overflow-hidden lg:rounded-2xl lg:border lg:border-desk-divider lg:shadow-2xl lg:shadow-black/40">
        <ChatInterface />
      </div>
    </div>
  )
}
