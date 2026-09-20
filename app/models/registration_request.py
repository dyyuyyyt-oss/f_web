"""
注册申请数据库模型
用户提交注册申请后先落在这张表，管理员审核通过才会正式创建 User
"""

from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime
from app.db.base import Base


class RegistrationRequest(Base):
    """注册申请表"""

    __tablename__ = "registration_request"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(255), nullable=False, index=True)  # 意向用户名
    password_hash = Column(String(255), nullable=False)  # 意向密码的哈希
    status = Column(String(20), nullable=False, default="pending")  # pending / approved / rejected
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    def __repr__(self) -> str:
        return f"<RegistrationRequest id={self.id} username={self.username} status={self.status}>"
