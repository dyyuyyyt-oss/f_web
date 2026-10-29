import GroupChat from '../components/GroupChat'

// 群聊页（/group）：和聊天页同一套暗色窗口外框，左侧群列表 + 右侧群聊
export default function GroupPage() {
  return (
    <div className="h-dvh bg-desk-bg font-desk text-desk-text lg:p-6">
      <div className="mx-auto h-full max-w-[1120px] overflow-hidden lg:rounded-2xl lg:border lg:border-desk-divider lg:shadow-2xl lg:shadow-black/40">
        <GroupChat />
      </div>
    </div>
  )
}
