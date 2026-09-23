"""
文件上传相关工具函数
用于处理角色头像等图片上传
"""

import uuid
from pathlib import Path
from fastapi import UploadFile, HTTPException
from app.core.config import settings

# 头像文件保存目录（项目根目录下的 uploads/avatars）
AVATAR_UPLOAD_DIR = Path("uploads/avatars")
ALLOWED_AVATAR_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
MAX_AVATAR_SIZE = 5 * 1024 * 1024  # 5MB


async def save_avatar_file(file: UploadFile) -> str:
    """
    校验并保存上传的头像图片文件

    Args:
        file: 前端上传的图片文件（multipart/form-data）

    Returns:
        保存后的图片访问 URL（相对路径，经由 /api/uploads 静态目录访问）
    """
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_AVATAR_EXTENSIONS:
        raise HTTPException(
            status_code=422,
            detail=f"不支持的图片格式，仅支持: {', '.join(sorted(ALLOWED_AVATAR_EXTENSIONS))}",
        )

    content = await file.read()
    if not content:
        raise HTTPException(status_code=422, detail="上传的文件为空")
    if len(content) > MAX_AVATAR_SIZE:
        raise HTTPException(status_code=422, detail="图片大小超过限制（最大 5MB）")

    AVATAR_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid.uuid4().hex}{ext}"
    (AVATAR_UPLOAD_DIR / filename).write_bytes(content)

    return f"{settings.api_prefix}/uploads/avatars/{filename}"


# 聊天图片保存目录（项目根目录下的 uploads，与头像目录同级）
# 注意：Render 免费实例的文件系统是临时的，服务重启/重新部署后这里保存的图片会丢失，
# 目前先接受这个限制，后续可以迁移到对象存储（如火山引擎 TOS、Cloudflare R2）
CHAT_IMAGE_UPLOAD_DIR = Path("uploads")
ALLOWED_CHAT_IMAGE_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_CHAT_IMAGE_SIZE = 10 * 1024 * 1024  # 10MB

# content-type 到文件扩展名的映射，用于生成保存文件名
_CHAT_IMAGE_EXTENSIONS = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
}


async def save_chat_image_file(file: UploadFile) -> str:
    """
    校验并保存聊天消息里上传的图片文件

    Args:
        file: 前端上传的图片文件（multipart/form-data）

    Returns:
        保存后的图片访问 URL（如 /uploads/xxx.jpg，经由挂载在根路径的 /uploads 静态目录访问）
    """
    content_type = file.content_type
    if content_type not in ALLOWED_CHAT_IMAGE_CONTENT_TYPES:
        raise HTTPException(
            status_code=422,
            detail=f"不支持的图片类型，仅支持: {', '.join(sorted(ALLOWED_CHAT_IMAGE_CONTENT_TYPES))}",
        )

    content = await file.read()
    if not content:
        raise HTTPException(status_code=422, detail="上传的文件为空")
    if len(content) > MAX_CHAT_IMAGE_SIZE:
        raise HTTPException(status_code=422, detail="图片大小超过限制（最大 10MB）")

    CHAT_IMAGE_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid.uuid4().hex}{_CHAT_IMAGE_EXTENSIONS[content_type]}"
    (CHAT_IMAGE_UPLOAD_DIR / filename).write_bytes(content)

    return f"/uploads/{filename}"
