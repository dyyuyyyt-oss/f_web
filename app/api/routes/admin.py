"""
管理后台路由
处理账号管理（列表、新增、编辑、删除）和注册申请审核
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.db.session import get_db
from app.api.deps import require_admin
from app.models.user import User
from app.models.registration_request import RegistrationRequest
from app.schemas.auth import UserPublicSchema
from app.schemas.admin import UserCreateRequest, UserUpdateRequest, RegistrationRequestSchema
from app.core.security import hash_password
import logging

router = APIRouter(prefix="/admin", tags=["管理后台"])
logger = logging.getLogger(__name__)


@router.get(
    "/users",
    tags=["管理后台"],
    response_model=List[UserPublicSchema],
    summary="账号列表",
    description="返回所有正式账号（仅管理员可访问）。",
    responses={
        200: {"description": "返回账号列表"},
        403: {"description": "非管理员访问"},
        500: {"description": "服务器内部错误"},
    },
)
async def list_users(db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    """获取所有正式账号列表"""
    try:
        return db.query(User).order_by(User.created_at).all()
    except Exception as e:
        logger.error(f"Error listing users: {e}")
        raise HTTPException(status_code=500, detail="获取账号列表失败")


@router.post(
    "/users",
    tags=["管理后台"],
    response_model=UserPublicSchema,
    summary="手动新增账号",
    description="管理员直接创建一个正式账号，无需走注册审核流程。",
    responses={
        200: {"description": "创建成功"},
        409: {"description": "用户名已被占用"},
        500: {"description": "服务器内部错误"},
    },
)
async def create_user(
    payload: UserCreateRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """管理员手动新增账号"""
    try:
        existing = db.query(User).filter(User.username == payload.username).first()
        if existing:
            raise HTTPException(status_code=409, detail="用户名已被占用")

        new_user = User(
            username=payload.username,
            password_hash=hash_password(payload.password),
            role=payload.role,
        )
        db.add(new_user)
        db.commit()
        db.refresh(new_user)
        return new_user
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating user: {e}")
        raise HTTPException(status_code=500, detail="创建账号失败")


@router.patch(
    "/users/{user_id}",
    tags=["管理后台"],
    response_model=UserPublicSchema,
    summary="编辑账号",
    description="修改指定账号的用户名和/或密码，只传需要修改的字段。",
    responses={
        200: {"description": "更新成功"},
        404: {"description": "账号不存在"},
        409: {"description": "新用户名已被占用"},
        500: {"description": "服务器内部错误"},
    },
)
async def update_user(
    user_id: int,
    payload: UserUpdateRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """编辑账号的用户名和/或密码"""
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="账号不存在")

        if payload.username and payload.username != user.username:
            existing = db.query(User).filter(User.username == payload.username).first()
            if existing:
                raise HTTPException(status_code=409, detail="新用户名已被占用")
            user.username = payload.username

        if payload.password:
            user.password_hash = hash_password(payload.password)

        db.commit()
        db.refresh(user)
        return user
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating user {user_id}: {e}")
        raise HTTPException(status_code=500, detail="更新账号失败")


@router.delete(
    "/users/{user_id}",
    tags=["管理后台"],
    summary="删除账号",
    description="删除指定账号。",
    responses={
        200: {"description": "删除成功"},
        404: {"description": "账号不存在"},
        500: {"description": "服务器内部错误"},
    },
)
async def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """删除账号"""
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="账号不存在")

        db.delete(user)
        db.commit()
        return {"message": "账号已删除"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting user {user_id}: {e}")
        raise HTTPException(status_code=500, detail="删除账号失败")


@router.get(
    "/registration-requests",
    tags=["管理后台"],
    response_model=List[RegistrationRequestSchema],
    summary="待审核注册申请列表",
    description="返回所有状态为 pending 的注册申请。",
    responses={
        200: {"description": "返回待审核申请列表"},
        500: {"description": "服务器内部错误"},
    },
)
async def list_pending_requests(db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    """获取待审核的注册申请列表"""
    try:
        return (
            db.query(RegistrationRequest)
            .filter(RegistrationRequest.status == "pending")
            .order_by(RegistrationRequest.created_at)
            .all()
        )
    except Exception as e:
        logger.error(f"Error listing registration requests: {e}")
        raise HTTPException(status_code=500, detail="获取待审核申请列表失败")


@router.post(
    "/registration-requests/{request_id}/approve",
    tags=["管理后台"],
    response_model=UserPublicSchema,
    summary="同意注册申请",
    description="批准指定的注册申请，创建正式账号。",
    responses={
        200: {"description": "已批准，返回新建的账号信息"},
        404: {"description": "申请不存在或已被处理"},
        409: {"description": "用户名在批准前已被其他账号占用"},
        500: {"description": "服务器内部错误"},
    },
)
async def approve_request(
    request_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """同意注册申请，创建正式账号"""
    try:
        req = (
            db.query(RegistrationRequest)
            .filter(RegistrationRequest.id == request_id, RegistrationRequest.status == "pending")
            .first()
        )
        if not req:
            raise HTTPException(status_code=404, detail="申请不存在或已被处理")

        existing = db.query(User).filter(User.username == req.username).first()
        if existing:
            raise HTTPException(status_code=409, detail="用户名在批准前已被其他账号占用")

        new_user = User(username=req.username, password_hash=req.password_hash, role="user")
        db.add(new_user)
        req.status = "approved"
        db.commit()
        db.refresh(new_user)
        return new_user
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error approving registration request {request_id}: {e}")
        raise HTTPException(status_code=500, detail="批准申请失败")


@router.post(
    "/registration-requests/{request_id}/reject",
    tags=["管理后台"],
    summary="拒绝注册申请",
    description="拒绝指定的注册申请。",
    responses={
        200: {"description": "已拒绝"},
        404: {"description": "申请不存在或已被处理"},
        500: {"description": "服务器内部错误"},
    },
)
async def reject_request(
    request_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """拒绝注册申请"""
    try:
        req = (
            db.query(RegistrationRequest)
            .filter(RegistrationRequest.id == request_id, RegistrationRequest.status == "pending")
            .first()
        )
        if not req:
            raise HTTPException(status_code=404, detail="申请不存在或已被处理")

        req.status = "rejected"
        db.commit()
        return {"message": "申请已拒绝"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error rejecting registration request {request_id}: {e}")
        raise HTTPException(status_code=500, detail="拒绝申请失败")
