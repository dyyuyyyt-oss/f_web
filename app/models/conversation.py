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
    character_id = Column(Integer, ForeignKey("character.id"), nullable=False, index=True)
    title = Column(String(255), nullable=False)  # 对话标题
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    def __repr__(self) -> str:
        return f"<Conversation id={self.id} user_id={self.user_id} character_id={self.character_id}>"
