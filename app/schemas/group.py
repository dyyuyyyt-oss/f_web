"""
群聊相关的数据验证模型（Pydantic schemas）
"""

from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field


class GroupCreateRequest(BaseModel):
    """建群请求"""

    name: str = Field(..., min_length=1, max_length=255, description="群名")
    character_ids: List[int] = Field(..., description="成员角色 ID，按发言顺序排列")


class GroupUpdateRequest(BaseModel):
    """修改群：改名，和 / 或 整体替换成员与发言顺序（只传要改的字段）"""

    name: Optional[str] = Field(default=None, min_length=1, max_length=255, description="新群名")
    character_ids: Optional[List[int]] = Field(default=None, description="新的成员列表，按发言顺序排列")


class SpeakerSchema(BaseModel):
    """发言人（角色）的简要信息"""

    id: int
    name: str
    avatar: Optional[str] = None


class GroupMemberSchema(BaseModel):
    """群成员"""

    character_id: int
    position: int = Field(..., description="发言顺序，从 0 开始")
    name: str
    avatar: Optional[str] = None


class GroupSchema(BaseModel):
    """群详情"""

    id: int
    name: str
    members: List[GroupMemberSchema]
    created_at: datetime
    updated_at: datetime


class GroupConfigSchema(BaseModel):
    """群聊的限制（由后端配置决定，前端据此做校验和提示）"""

    min_members: int = Field(..., description="一个群至少几个角色")
    max_members: int = Field(..., description="一个群最多几个角色（GROUP_MAX_MEMBERS）")
    max_speakers: int = Field(..., description="一轮默认最多几个角色发言（GROUP_MAX_SPEAKERS）")


class GroupMessageSchema(BaseModel):
    """群聊里的一条消息"""

    id: int
    role: str = Field(..., description="user 或 assistant")
    content: str
    image_url: Optional[str] = None
    created_at: datetime
    speaker: Optional[SpeakerSchema] = Field(default=None, description="assistant 消息的发言角色；角色已被删除时为空")


class GroupMessagesResponse(BaseModel):
    """群聊历史"""

    conversation_id: Optional[int] = Field(default=None, description="群聊会话 ID；还没聊过时为空")
    messages: List[GroupMessageSchema]


class GroupChatRequest(BaseModel):
    """群聊发言请求"""

    message: str = Field(..., min_length=1, max_length=4096, description="用户这次说的话")
    conversation_id: Optional[int] = Field(default=None, description="可选；不传则使用该群的会话")
    allow_emoji: bool = Field(default=True, description="是否允许角色回复中包含表情符号")
    max_speakers: Optional[int] = Field(default=None, ge=1, description="这一轮最多几个角色发言；不传用后端默认值，超过成员数就全说")
