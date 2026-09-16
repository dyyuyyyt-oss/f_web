"""
AI 角色数据库模型
"""

from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime
from app.db.base import Base


class Character(Base):
    """AI 角色表"""

    __tablename__ = "character"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False, index=True)  # 角色名称
    avatar = Column(String(500), nullable=True)  # 头像 URL
    persona = Column(Text, nullable=True)  # 人设描述
    greeting = Column(Text, nullable=True)  # 初始问候语
    scenario = Column(Text, nullable=True)  # 对话场景设定
    example_dialogue = Column(Text, nullable=True)  # 示例对话
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    def __repr__(self) -> str:
        return f"<Character id={self.id} name={self.name}>"
