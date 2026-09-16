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
