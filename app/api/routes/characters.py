"""
角色相关路由
处理角色列表、创建、编辑等
"""

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.character import Character
from app.schemas.character import (
    CharacterResponseSchema,
    CharacterCreate,
    CharacterAvatarUpdate,
    AvatarUploadResponse,
)
from app.utils.upload import save_avatar_file
from app.api.deps import get_current_user
from app.models.user import User
from typing import List
import logging

router = APIRouter(prefix="/characters", tags=["角色"])
logger = logging.getLogger(__name__)


@router.get("", tags=["角色"], response_model=List[CharacterResponseSchema], summary="角色列表", description="返回所有可用角色，支持分页查询")
async def list_characters(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    获取角色列表

    Query 参数：
    - skip: 跳过数量（分页，默认 0）
    - limit: 返回数量（分页，默认 100）

    Returns:
        角色列表
    """
    try:
        characters = db.query(Character).offset(skip).limit(limit).all()
        return characters
    except Exception as e:
        logger.error(f"Error fetching characters: {e}")
        raise HTTPException(status_code=500, detail="获取角色列表失败")


@router.get("/{character_id}", tags=["角色"], response_model=CharacterResponseSchema, summary="角色详情", description="根据角色 ID 返回指定角色的详细信息")
async def get_character(
    character_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    获取单个角色信息

    Args:
        character_id: 角色 ID

    Returns:
        角色详情
    """
    try:
        character = db.query(Character).filter(Character.id == character_id).first()
        if not character:
            raise HTTPException(status_code=404, detail="角色不存在")
        return character
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching character {character_id}: {e}")
        raise HTTPException(status_code=500, detail="获取角色信息失败")


@router.post(
    "",
    tags=["角色"],
    response_model=CharacterResponseSchema,
    summary="创建角色",
    description="新增一个角色卡，供聊天时注入人设。",
    responses={
        200: {"description": "创建成功，返回新建角色的完整信息（含 id、created_at）"},
        422: {"description": "请求参数校验失败，例如 name 或 persona 为空"},
        500: {"description": "服务器内部错误，创建角色失败"},
    },
)
async def create_character(
    character: CharacterCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    创建新角色
    TODO: 实现权限控制

    Args:
        character: 角色信息（name、persona 必填）

    Returns:
        新建的角色
    """
    try:
        db_character = Character(
            name=character.name,
            avatar=character.avatar,
            persona=character.persona,
            greeting=character.greeting,
            scenario=character.scenario,
            example_dialogue=character.example_dialogue,
        )
        db.add(db_character)
        db.commit()
        db.refresh(db_character)
        return db_character
    except Exception as e:
        logger.error(f"Error creating character: {e}")
        raise HTTPException(status_code=500, detail="创建角色失败")


@router.post(
    "/avatar",
    tags=["角色"],
    response_model=AvatarUploadResponse,
    summary="上传角色头像图片",
    description="上传一张本地图片文件，保存后返回可用于角色 avatar 字段的访问 URL。",
    responses={
        200: {"description": "上传成功，返回图片访问 URL"},
        422: {"description": "文件格式不支持或文件过大"},
        500: {"description": "服务器内部错误，上传失败"},
    },
)
async def upload_avatar(
    file: UploadFile = File(..., description="头像图片文件"),
    current_user: User = Depends(get_current_user),
):
    """
    上传角色头像图片文件

    Args:
        file: 图片文件（jpg/jpeg/png/gif/webp，最大 5MB）

    Returns:
        上传后的图片访问 URL
    """
    try:
        url = await save_avatar_file(file)
        return AvatarUploadResponse(url=url)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error uploading avatar: {e}")
        raise HTTPException(status_code=500, detail="上传头像失败")


@router.patch(
    "/{character_id}/avatar",
    tags=["角色"],
    response_model=CharacterResponseSchema,
    summary="更新角色头像",
    description="更新指定角色的头像图片 URL，用于给已有角色更换头像。",
    responses={
        200: {"description": "更新成功，返回更新后的角色完整信息"},
        404: {"description": "角色不存在"},
        422: {"description": "请求参数校验失败，例如 avatar 为空"},
        500: {"description": "服务器内部错误，更新头像失败"},
    },
)
async def update_character_avatar(
    character_id: int,
    payload: CharacterAvatarUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    更新已有角色的头像

    Args:
        character_id: 角色 ID
        payload: 包含新头像 URL 的请求体

    Returns:
        更新后的角色信息
    """
    try:
        character = db.query(Character).filter(Character.id == character_id).first()
        if not character:
            raise HTTPException(status_code=404, detail="角色不存在")
        character.avatar = payload.avatar
        db.commit()
        db.refresh(character)
        return character
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating avatar for character {character_id}: {e}")
        raise HTTPException(status_code=500, detail="更新角色头像失败")
