"""
图片识别相关的数据验证模型（Pydantic schemas）
"""

from pydantic import BaseModel, Field
from typing import Optional


class ImageDescribeRequest(BaseModel):
    """图片描述请求 Schema"""

    image_url: str = Field(..., min_length=1, description="待描述的图片地址，必填")
    hint: Optional[str] = Field(default=None, description="用户对这张图的额外说明，可选")


class ImageDescribeResponse(BaseModel):
    """图片描述响应 Schema"""

    description: str = Field(..., description="豆包生成的图片描述文本")
    success: bool = Field(..., description="是否描述成功")
