"""
聊天相关的数据验证模型（Pydantic schemas）
"""

from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class CharacterSchema(BaseModel):
    """角色信息 Schema"""

    id: int = Field(..., description="角色唯一标识")
    name: str = Field(..., description="角色名称")
    avatar: Optional[str] = Field(default=None, description="角色头像图片 URL")
    persona: Optional[str] = Field(default=None, description="角色人设描述")
    greeting: Optional[str] = Field(default=None, description="角色的问候语")
    scenario: Optional[str] = Field(default=None, description="角色对话场景设定")
    example_dialogue: Optional[str] = Field(default=None, description="角色示例对话内容")
    created_at: datetime = Field(..., description="角色创建时间")

    class Config:
        from_attributes = True  # Pydantic v2 兼容 ORM 模型


class MessageSchema(BaseModel):
    """单条消息 Schema"""

    id: int = Field(..., description="消息唯一标识")
    conversation_id: int = Field(..., description="所属会话 ID")
    role: str = Field(..., description="消息角色，user 或 assistant")
    content: str = Field(..., description="消息内容")
    image_url: Optional[str] = Field(default=None, description="用户发送的图片地址（可选）")
    created_at: datetime = Field(..., description="消息创建时间")

    class Config:
        from_attributes = True


class ChatMessageInput(BaseModel):
    """聊天输入请求 Schema"""

    # 允许空字符串：用户可以只发图片不写文字，此时前端应保证 image_url 非空
    message: str = Field(..., max_length=4096, description="用户发送的消息内容，纯图片消息可为空字符串")
    character_id: int = Field(..., gt=0, description="角色 ID")
    allow_emoji: bool = Field(default=True, description="是否允许 AI 回复中包含表情符号，默认允许")
    image_url: Optional[str] = Field(default=None, description="用户发送的图片地址，可选")


class ChatSendResponse(BaseModel):
    """非流式聊天响应 Schema"""

    reply: str = Field(..., description="AI 返回的完整回复")
    character_id: int = Field(..., description="角色 ID")
    conversation_id: int = Field(..., description="会话 ID")


class ChatStreamResponse(BaseModel):
    """聊天流式响应 Schema"""

    conversation_id: int = Field(..., description="当前对话唯一标识")
    content: str = Field(..., description="SSE 流中的一段文本内容")  # SSE 流中的一段文本


class ConversationSchema(BaseModel):
    """对话会话 Schema"""

    id: int = Field(..., description="会话唯一标识")
    user_id: int = Field(..., description="会话所属用户 ID")
    character_id: int = Field(..., description="当前对话关联的角色 ID")
    title: str = Field(..., description="对话标题")
    created_at: datetime = Field(..., description="会话创建时间")
    updated_at: datetime = Field(..., description="会话更新时间")

    class Config:
        from_attributes = True
