"""
密码哈希与登录 JWT 的工具函数
"""

from datetime import datetime, timedelta, timezone
from typing import Optional
import bcrypt
import jwt
from app.core.config import settings


def hash_password(plain_password: str) -> str:
    """将明文密码哈希后返回，用于存库"""
    hashed = bcrypt.hashpw(plain_password.encode("utf-8"), bcrypt.gensalt())
    return hashed.decode("utf-8")


def verify_password(plain_password: str, password_hash: str) -> bool:
    """校验明文密码是否与存库的哈希值匹配"""
    return bcrypt.checkpw(plain_password.encode("utf-8"), password_hash.encode("utf-8"))


def create_access_token(user_id: int, username: str, role: str) -> str:
    """签发登录 JWT，载荷包含用户 id、用户名、角色和过期时间"""
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    payload = {
        "sub": str(user_id),
        "username": username,
        "role": role,
        "exp": expire,
    }
    return jwt.encode(payload, settings.secret_key, algorithm="HS256")


def decode_access_token(token: str) -> Optional[dict]:
    """解码并校验 JWT，失败（过期/签名不对等）返回 None"""
    try:
        return jwt.decode(token, settings.secret_key, algorithms=["HS256"])
    except jwt.PyJWTError:
        return None
