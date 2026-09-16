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
    content = Column(Text, nullable=False)  # 消息内容
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    def __repr__(self) -> str:
        return f"<Message id={self.id} conversation_id={self.conversation_id} role={self.role}>"
