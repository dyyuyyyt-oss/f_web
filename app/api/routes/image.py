"""
图片识别路由
处理图片内容描述请求
"""

from fastapi import APIRouter, Depends, HTTPException
from app.schemas.image import ImageDescribeRequest, ImageDescribeResponse
from app.services.image_service import describe_image, ImageDescribeError
from app.api.deps import get_current_user
from app.models.user import User
import logging

router = APIRouter(prefix="/image", tags=["图片识别"])
logger = logging.getLogger(__name__)


@router.post(
    "/describe",
    tags=["图片识别"],
    response_model=ImageDescribeResponse,
    summary="图片内容描述",
    description="使用豆包 Seed 2.1 Pro 描述图片内容，供后续对话使用。",
    responses={
        200: {"description": "描述成功"},
        500: {"description": "图片识别失败，响应中附带错误信息"},
    },
)
async def describe_image_route(
    payload: ImageDescribeRequest,
    current_user: User = Depends(get_current_user),
):
    """
    调用豆包描述图片内容

    Args:
        payload: 图片地址和可选的额外说明

    Returns:
        图片描述文本
    """
    try:
        description = await describe_image(payload.image_url, extra_hint=payload.hint or "")
        return ImageDescribeResponse(description=description, success=True)
    except ImageDescribeError as e:
        logger.error(f"Error describing image: {e}")
        raise HTTPException(status_code=500, detail=str(e))
