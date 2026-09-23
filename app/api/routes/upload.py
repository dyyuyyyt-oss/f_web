"""
通用文件上传路由
目前用于聊天消息里的图片上传
"""

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from app.utils.upload import save_chat_image_file
from app.api.deps import get_current_user
from app.models.user import User
import logging

router = APIRouter(prefix="/upload", tags=["文件上传"])
logger = logging.getLogger(__name__)


@router.post(
    "/image",
    tags=["文件上传"],
    summary="上传图片",
    description="上传一张图片，用于聊天消息中附带图片，返回可访问的图片 URL。",
    responses={
        200: {"description": "上传成功，返回图片访问 URL"},
        422: {"description": "文件类型不支持或文件过大"},
        500: {"description": "服务器内部错误，上传失败"},
    },
)
async def upload_image(
    file: UploadFile = File(..., description="图片文件（jpg/png/webp/gif，最大 10MB）"),
    current_user: User = Depends(get_current_user),
):
    """
    上传聊天图片

    Args:
        file: 图片文件

    Returns:
        {"url": "上传后的图片访问 URL"}
    """
    try:
        url = await save_chat_image_file(file)
        return {"url": url}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error uploading chat image: {e}")
        raise HTTPException(status_code=500, detail="上传图片失败")
