"""
用户数据库模型
"""

from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime
from app.db.base import Base


class User(Base):
    """用户表"""

    __tablename__ = "user"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(255), unique=True, index=True, nullable=False)
    email = Column(String(255), unique=True, index=True, nullable=True)
    password_hash = Column(String(255), nullable=True)  # 早期示例账号可能没有密码，登录不了但不影响其他数据
    role = Column(String(20), nullable=False, default="user")  # "user" 或 "admin"
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    def __repr__(self) -> str:
        return f"<User id={self.id} username={self.username}>"
