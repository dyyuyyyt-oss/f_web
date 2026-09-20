"""
认证相关路由
处理登录、注册申请、获取当前登录用户信息
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.api.deps import get_current_user
from app.models.user import User
from app.models.registration_request import RegistrationRequest
from app.schemas.auth import LoginRequest, RegisterRequest, TokenResponse, UserPublicSchema
from app.core.security import hash_password, verify_password, create_access_token
import logging

router = APIRouter(prefix="/auth", tags=["认证"])
logger = logging.getLogger(__name__)


@router.post(
    "/login",
    tags=["认证"],
    response_model=TokenResponse,
    summary="登录",
    description="使用用户名和密码登录，成功返回登录令牌和用户信息。",
    responses={
        200: {"description": "登录成功，返回 JWT 令牌和用户信息"},
        401: {"description": "用户名或密码错误"},
        500: {"description": "服务器内部错误，登录失败"},
    },
)
async def login(payload: LoginRequest, db: Session = Depends(get_db)):
    """
    登录

    Args:
        payload: 用户名和密码

    Returns:
        登录令牌和当前用户信息
    """
    try:
        user = db.query(User).filter(User.username == payload.username).first()
        if not user or not user.password_hash or not verify_password(payload.password, user.password_hash):
            raise HTTPException(status_code=401, detail="用户名或密码错误")

        token = create_access_token(user.id, user.username, user.role)
        return TokenResponse(access_token=token, user=user)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error during login: {e}")
        raise HTTPException(status_code=500, detail="登录失败")


@router.post(
    "/register",
    tags=["认证"],
    summary="提交注册申请",
    description="提交意向用户名和密码，进入待审核列表，需管理员批准后才能登录。",
    responses={
        200: {"description": "申请提交成功，等待管理员审核"},
        409: {"description": "用户名已被占用或已有一份待审核申请"},
        500: {"description": "服务器内部错误，提交申请失败"},
    },
)
async def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    """
    提交注册申请

    Args:
        payload: 意向用户名和密码

    Returns:
        提交成功的提示信息
    """
    try:
        existing_user = db.query(User).filter(User.username == payload.username).first()
        if existing_user:
            raise HTTPException(status_code=409, detail="用户名已被占用")

        pending_request = (
            db.query(RegistrationRequest)
            .filter(
                RegistrationRequest.username == payload.username,
                RegistrationRequest.status == "pending",
            )
            .first()
        )
        if pending_request:
            raise HTTPException(status_code=409, detail="该用户名已提交过申请，请等待管理员审核")

        new_request = RegistrationRequest(
            username=payload.username,
            password_hash=hash_password(payload.password),
            status="pending",
        )
        db.add(new_request)
        db.commit()
        return {"message": "申请已提交，等待管理员审核"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error during register: {e}")
        raise HTTPException(status_code=500, detail="提交申请失败")


@router.get(
    "/me",
    tags=["认证"],
    response_model=UserPublicSchema,
    summary="获取当前登录用户信息",
    description="根据登录令牌返回当前用户信息，用于前端刷新页面后恢复登录态。",
    responses={
        200: {"description": "返回当前用户信息"},
        401: {"description": "未登录或登录已失效"},
    },
)
async def get_me(current_user: User = Depends(get_current_user)):
    """获取当前登录用户信息"""
    return current_user
