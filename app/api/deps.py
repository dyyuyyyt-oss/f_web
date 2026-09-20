"""
鉴权相关的 FastAPI 依赖
"""

from fastapi import Depends, HTTPException, Header
from sqlalchemy.orm import Session
from typing import Optional
from app.db.session import get_db
from app.models.user import User
from app.core.security import decode_access_token


async def get_current_user(
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    """
    从 Authorization: Bearer <token> 头解出当前登录用户
    token 缺失、无效或用户不存在都返回 401
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="未登录或登录已失效，请重新登录")

    token = authorization.removeprefix("Bearer ").strip()
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="登录凭证无效或已过期，请重新登录")

    user = db.query(User).filter(User.id == int(payload["sub"])).first()
    if not user:
        raise HTTPException(status_code=401, detail="账号不存在，请重新登录")

    return user


async def require_admin(current_user: User = Depends(get_current_user)) -> User:
    """要求当前登录用户是管理员，否则返回 403"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="仅管理员可访问此功能")
    return current_user
