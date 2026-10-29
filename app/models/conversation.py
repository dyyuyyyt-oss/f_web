"""
对话会话数据库模型
"""

from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from app.db.base import Base


class Conversation(Base):
    """对话会话表（用户与角色的对话记录）"""

    __tablename__ = "conversation"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("user.id"), nullable=False, index=True)
    # 单聊会话：对应一个角色；群聊会话：character_id 为空，group_id 指向群
    character_id = Column(Integer, ForeignKey("character.id"), nullable=True, index=True)
    group_id = Column(Integer, ForeignKey("chat_group.id"), nullable=True, index=True)
    title = Column(String(255), nullable=False)  # 对话标题
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    def __repr__(self) -> str:
        return f"<Conversation id={self.id} user_id={self.user_id} character_id={self.character_id}>"
