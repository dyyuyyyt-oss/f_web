"""
对话消息数据库模型
"""

from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from app.db.base import Base


class Message(Base):
    """消息表（对话中的单条消息）"""

    __tablename__ = "message"

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(Integer, ForeignKey("conversation.id"), nullable=False, index=True)
    role = Column(String(50), nullable=False)  # "user" 或 "assistant"
    content = Column(Text, nullable=False)  # 消息内容（用户原始文字，不含图片描述改写）
    image_url = Column(String(500), nullable=True)  # 用户发送的图片地址（可选）
    image_description = Column(Text, nullable=True)  # 豆包生成的图片描述，用于注入对话上下文
    # 群聊里这条 assistant 消息是哪个角色说的；单聊消息为空
    speaker_id = Column(Integer, ForeignKey("character.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    def __repr__(self) -> str:
        return f"<Message id={self.id} conversation_id={self.conversation_id} role={self.role}>"
