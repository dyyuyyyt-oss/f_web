"""
群聊数据库模型：群和群成员
"""

from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from app.db.base import Base


class Group(Base):
    """群聊（一个群属于一个用户，成员是若干个角色）"""

    __tablename__ = "chat_group"  # group 是 SQL 关键字，不用它做表名

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("user.id"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    def __repr__(self) -> str:
        return f"<Group id={self.id} owner_id={self.owner_id} name={self.name}>"


class GroupMember(Base):
    """群成员：群里的一个角色，position 是发言顺序（从 0 开始）"""

    __tablename__ = "group_member"

    id = Column(Integer, primary_key=True)
    group_id = Column(Integer, ForeignKey("chat_group.id", ondelete="CASCADE"), index=True, nullable=False)
    character_id = Column(Integer, ForeignKey("character.id", ondelete="CASCADE"), nullable=False)
    position = Column(Integer, nullable=False, default=0)

    def __repr__(self) -> str:
        return f"<GroupMember group_id={self.group_id} character_id={self.character_id} position={self.position}>"
