"""
认证相关的数据验证模型（Pydantic schemas）
"""

from pydantic import BaseModel, Field
from datetime import datetime


class LoginRequest(BaseModel):
    """登录请求 Schema"""

    username: str = Field(..., min_length=1, description="用户名")
    password: str = Field(..., min_length=1, description="密码")


class RegisterRequest(BaseModel):
    """注册申请请求 Schema"""

    username: str = Field(..., min_length=1, max_length=255, description="意向用户名")
    password: str = Field(..., min_length=1, description="意向密码")


class UserPublicSchema(BaseModel):
    """对外展示的用户信息 Schema（不含密码哈希）"""

    id: int = Field(..., description="用户唯一标识")
    username: str = Field(..., description="用户名")
    role: str = Field(..., description="角色：user 或 admin")
    created_at: datetime = Field(..., description="账号创建时间")

    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    """登录成功后的响应 Schema"""

    access_token: str = Field(..., description="登录令牌（JWT）")
    token_type: str = Field(default="bearer", description="令牌类型")
    user: UserPublicSchema = Field(..., description="当前登录用户信息")
