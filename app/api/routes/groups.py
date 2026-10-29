"""
群聊路由：群的增删改查、群聊历史、清空（流式发言接口见本文件的 /{group_id}/chat）
所有接口都只能操作当前登录用户自己的群：不存在 404，不是群主 403
"""

import logging
from datetime import datetime
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.api.deps import get_current_user
from app.core.config import settings
from app.db.session import get_db
from app.models import Character, Group, Message, User
from app.schemas.group import (
    GroupConfigSchema,
    GroupCreateRequest,
    GroupMessagesResponse,
    GroupSchema,
    GroupUpdateRequest,
)
from app.services.group_service import (
    MIN_GROUP_MEMBERS,
    delete_group_cascade,
    get_group_conversation,
    get_own_group,
    group_to_dict,
    replace_members,
    validate_member_ids,
)

router = APIRouter(prefix="/groups", tags=["群聊"])
logger = logging.getLogger(__name__)


@router.get("/config", response_model=GroupConfigSchema, summary="群聊限制", description="一个群的成员数上下限、一轮默认最多几个角色发言")
async def get_group_config(current_user: User = Depends(get_current_user)):
    return GroupConfigSchema(
        min_members=MIN_GROUP_MEMBERS,
        max_members=settings.group_max_members,
        max_speakers=settings.group_max_speakers,
    )


@router.get("", response_model=List[GroupSchema], summary="群列表", description="当前用户的全部群（含成员，按最近更新排序）")
async def list_groups(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    groups = db.query(Group).filter_by(owner_id=current_user.id).order_by(Group.updated_at.desc(), Group.id.desc()).all()
    return [group_to_dict(db, g) for g in groups]


@router.post("", response_model=GroupSchema, status_code=201, summary="建群", description="body: {name, character_ids}，character_ids 的顺序就是发言顺序")
async def create_group(payload: GroupCreateRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    characters = validate_member_ids(db, payload.character_ids)
    group = Group(owner_id=current_user.id, name=payload.name.strip() or payload.name)
    db.add(group)
    db.flush()
    replace_members(db, group, characters)
    db.commit()
    db.refresh(group)
    return group_to_dict(db, group)


@router.get("/{group_id}", response_model=GroupSchema, summary="群详情")
async def get_group(group_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return group_to_dict(db, get_own_group(db, group_id, current_user.id))


@router.patch("/{group_id}", response_model=GroupSchema, summary="修改群", description="改名，和 / 或 整体替换成员与发言顺序")
async def update_group(group_id: int, payload: GroupUpdateRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    group = get_own_group(db, group_id, current_user.id)
    if payload.name is not None:
        group.name = payload.name.strip() or payload.name
    if payload.character_ids is not None:
        replace_members(db, group, validate_member_ids(db, payload.character_ids))
    group.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(group)
    return group_to_dict(db, group)


@router.delete("/{group_id}", summary="解散群", description="同时删除该群的聊天记录")
async def delete_group(group_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    group = get_own_group(db, group_id, current_user.id)
    try:
        delete_group_cascade(db, group)
        db.commit()
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting group {group_id}: {e}")
        raise HTTPException(status_code=500, detail="解散群失败")
    return {"deleted": True}


@router.get("/{group_id}/messages", response_model=GroupMessagesResponse, summary="群聊历史", description="按时间正序；assistant 消息带发言角色信息")
async def get_group_messages(group_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    group = get_own_group(db, group_id, current_user.id)
    conversation = get_group_conversation(db, group)
    if conversation is None:
        return GroupMessagesResponse(conversation_id=None, messages=[])
    rows = (
        db.query(Message, Character)
        .outerjoin(Character, Character.id == Message.speaker_id)
        .filter(Message.conversation_id == conversation.id)
        .order_by(Message.created_at, Message.id)
        .all()
    )
    return GroupMessagesResponse(
        conversation_id=conversation.id,
        messages=[
            {
                "id": m.id,
                "role": m.role,
                "content": m.content,
                "image_url": m.image_url,
                "created_at": m.created_at,
                "speaker": {"id": c.id, "name": c.name, "avatar": c.avatar} if c else None,
            }
            for m, c in rows
        ],
    )


@router.post("/{group_id}/clear", summary="清空群聊历史", description="删除该群的全部聊天记录，保留群和成员")
async def clear_group_messages(group_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    group = get_own_group(db, group_id, current_user.id)
    conversation = get_group_conversation(db, group)
    if conversation is None:
        return {"deleted": 0}
    deleted = db.query(Message).filter_by(conversation_id=conversation.id).delete(synchronize_session=False)
    db.commit()
    return {"deleted": deleted}
