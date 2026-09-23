"""
角色相关路由
处理角色列表、创建、编辑等
"""

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models import Character, Conversation, Message
from app.schemas.character import (
    CharacterResponseSchema,
    CharacterCreate,
    CharacterAvatarUpdate,
    AvatarUploadResponse,
    CharacterUpdate,
    DeleteCharacterResponse,
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
            speaking_style=character.speaking_style,
            catchphrase=character.catchphrase,
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


@router.put(
    "/{character_id}",
    tags=["角色"],
    response_model=CharacterResponseSchema,
    summary="编辑角色",
    description="修改角色卡信息，只更新传入的字段。",
    responses={
        200: {"description": "编辑成功，返回更新后的角色完整信息"},
        404: {"description": "角色不存在"},
        500: {"description": "服务器内部错误，编辑角色失败"},
    },
)
async def update_character(
    character_id: int,
    payload: CharacterUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    编辑已有角色，只更新请求体中非 None 的字段

    Args:
        character_id: 角色 ID
        payload: 要更新的字段（未传的字段保持原值不变）

    Returns:
        更新后的角色完整信息
    """
    # TODO: Character 模型目前没有 owner_id/user_id 字段，无法区分"谁创建的角色"，
    # 暂时允许任何登录用户编辑任意角色；后续如果要限制"只有创建者能编辑"，
    # 需要先给 Character 加一个所有者字段并做一次历史数据迁移
    try:
        character = db.query(Character).filter(Character.id == character_id).first()
        if not character:
            raise HTTPException(status_code=404, detail="角色不存在")

        update_data = payload.model_dump(exclude_none=True)
        for field, value in update_data.items():
            setattr(character, field, value)

        db.commit()
        db.refresh(character)
        return character
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating character {character_id}: {e}")
        raise HTTPException(status_code=500, detail="编辑角色失败")


@router.delete(
    "/{character_id}",
    tags=["角色"],
    response_model=DeleteCharacterResponse,
    summary="删除角色",
    description="删除角色及其关联的会话和消息记录。",
    responses={
        200: {"description": "删除成功"},
        404: {"description": "角色不存在"},
        500: {"description": "服务器内部错误，删除角色失败"},
    },
)
async def delete_character(
    character_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    删除角色，级联删除该角色下所有会话及消息

    Args:
        character_id: 角色 ID

    Returns:
        {"deleted": true}
    """
    # TODO: 权限同编辑角色——Character 暂无 owner_id，先允许任何登录用户删除任意角色
    try:
        character = db.query(Character).filter(Character.id == character_id).first()
        if not character:
            raise HTTPException(status_code=404, detail="角色不存在")

        # 有外键约束，必须先删 message，再删 conversation，最后删 character
        conversation_ids = [
            row.id
            for row in db.query(Conversation.id).filter_by(character_id=character_id).all()
        ]
        if conversation_ids:
            db.query(Message).filter(Message.conversation_id.in_(conversation_ids)).delete(
                synchronize_session=False
            )
            db.query(Conversation).filter(Conversation.id.in_(conversation_ids)).delete(
                synchronize_session=False
            )

        db.delete(character)
        db.commit()
        return DeleteCharacterResponse(deleted=True)
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting character {character_id}: {e}")
        raise HTTPException(status_code=500, detail="删除角色失败")
