"""
管理后台相关的数据验证模型（Pydantic schemas）
"""

from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class UserCreateRequest(BaseModel):
    """管理员手动新增账号的请求 Schema"""

    username: str = Field(..., min_length=1, max_length=255, description="用户名")
    password: str = Field(..., min_length=1, description="密码")
    role: str = Field(default="user", description="角色：user 或 admin")


class UserUpdateRequest(BaseModel):
    """管理员编辑账号的请求 Schema，用户名和密码均可选（只传要改的字段）"""

    username: Optional[str] = Field(default=None, min_length=1, max_length=255, description="新用户名，不改则不传")
    password: Optional[str] = Field(default=None, min_length=1, description="新密码，不改则不传")


class RegistrationRequestSchema(BaseModel):
    """注册申请信息 Schema"""

    id: int = Field(..., description="申请唯一标识")
    username: str = Field(..., description="意向用户名")
    status: str = Field(..., description="申请状态：pending / approved / rejected")
    created_at: datetime = Field(..., description="申请提交时间")

    class Config:
        from_attributes = True
