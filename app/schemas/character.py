"""
角色相关的数据验证模型（Pydantic schemas）
"""

from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class CharacterCreate(BaseModel):
    """创建角色的请求 Schema"""

    name: str = Field(..., min_length=1, max_length=255, description="角色名称，必填")
    avatar: Optional[str] = Field(default=None, description="角色头像图片 URL，可选")
    persona: str = Field(..., min_length=1, description="角色的人设描述，必填")
    greeting: Optional[str] = Field(default=None, description="角色的欢迎语或问候语，可选")
    scenario: Optional[str] = Field(default=None, description="角色对话的场景设定，可选")
    example_dialogue: Optional[str] = Field(default=None, description="角色示例对话内容，可选")
    speaking_style: Optional[str] = Field(default=None, description="角色的说话风格，可选")
    catchphrase: Optional[str] = Field(default=None, description="角色的口头禅，可选")


class CharacterResponseSchema(BaseModel):
    """角色信息响应 Schema"""

    id: int = Field(..., description="角色唯一标识")
    name: str = Field(..., description="角色名称")
    avatar: Optional[str] = Field(default=None, description="角色头像图片 URL")
    persona: Optional[str] = Field(default=None, description="角色人设描述")
    greeting: Optional[str] = Field(default=None, description="角色的欢迎语或问候语")
    scenario: Optional[str] = Field(default=None, description="角色对话的场景设定")
    example_dialogue: Optional[str] = Field(default=None, description="角色示例对话内容")
    speaking_style: Optional[str] = Field(default=None, description="角色的说话风格")
    catchphrase: Optional[str] = Field(default=None, description="角色的口头禅")
    created_at: datetime = Field(..., description="角色创建时间")

    class Config:
        from_attributes = True


class CharacterAvatarUpdate(BaseModel):
    """更新角色头像的请求 Schema"""

    avatar: str = Field(..., min_length=1, description="新的角色头像图片 URL，必填")


class AvatarUploadResponse(BaseModel):
    """头像图片上传成功后的响应 Schema"""

    url: str = Field(..., description="上传后的图片访问 URL，可用于角色的 avatar 字段")
