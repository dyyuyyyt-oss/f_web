"""
群聊的数据操作：成员校验、群详情组装、群会话、删除时的级联清理
（群聊的流式发言在 group_chat_service.py）
"""

from typing import List, Optional
from fastapi import HTTPException
from sqlalchemy.orm import Session
from app.core.config import settings
from app.models import Character, Conversation, Group, GroupMember, Message

MIN_GROUP_MEMBERS = 2


def validate_member_ids(db: Session, character_ids: List[int]) -> List[Character]:
    """校验成员列表：不重复、数量在 [2, GROUP_MAX_MEMBERS] 之间、角色都存在。返回按传入顺序排列的角色"""
    if len(set(character_ids)) != len(character_ids):
        raise HTTPException(status_code=400, detail="成员不能重复")
    if len(character_ids) < MIN_GROUP_MEMBERS:
        raise HTTPException(status_code=400, detail=f"至少需要 {MIN_GROUP_MEMBERS} 个角色")
    if len(character_ids) > settings.group_max_members:
        raise HTTPException(status_code=400, detail=f"一个群最多 {settings.group_max_members} 个角色")
    characters = {c.id: c for c in db.query(Character).filter(Character.id.in_(character_ids)).all()}
    missing = [cid for cid in character_ids if cid not in characters]
    if missing:
        raise HTTPException(status_code=400, detail=f"角色不存在：{missing}")
    return [characters[cid] for cid in character_ids]


def get_own_group(db: Session, group_id: int, user_id: int) -> Group:
    """取当前用户自己的群：不存在 404，不是群主 403"""
    group = db.query(Group).filter_by(id=group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="群不存在")
    if group.owner_id != user_id:
        raise HTTPException(status_code=403, detail="无权访问该群")
    return group


def ordered_members(db: Session, group_id: int) -> List[tuple]:
    """按发言顺序返回 [(GroupMember, Character)]；角色已被删除的成员会被跳过"""
    return (
        db.query(GroupMember, Character)
        .join(Character, Character.id == GroupMember.character_id)
        .filter(GroupMember.group_id == group_id)
        .order_by(GroupMember.position, GroupMember.id)
        .all()
    )


def group_to_dict(db: Session, group: Group) -> dict:
    return {
        "id": group.id,
        "name": group.name,
        "members": [
            {"character_id": c.id, "position": m.position, "name": c.name, "avatar": c.avatar}
            for m, c in ordered_members(db, group.id)
        ],
        "created_at": group.created_at,
        "updated_at": group.updated_at,
    }


def replace_members(db: Session, group: Group, characters: List[Character]) -> None:
    """整体替换成员，position 按传入顺序从 0 开始"""
    db.query(GroupMember).filter_by(group_id=group.id).delete(synchronize_session=False)
    for position, character in enumerate(characters):
        db.add(GroupMember(group_id=group.id, character_id=character.id, position=position))


def get_group_conversation(db: Session, group: Group, create: bool = False) -> Optional[Conversation]:
    """群聊会话：每个群一个（属于群主），create=True 时没有就新建"""
    conversation = (
        db.query(Conversation)
        .filter_by(group_id=group.id, user_id=group.owner_id)
        .order_by(Conversation.created_at.desc())
        .first()
    )
    if conversation is None and create:
        conversation = Conversation(user_id=group.owner_id, character_id=None, group_id=group.id, title=group.name)
        db.add(conversation)
        db.commit()
        db.refresh(conversation)
    return conversation


def delete_group_cascade(db: Session, group: Group) -> None:
    """解散群：删除群聊会话的消息 → 会话 → 成员 → 群（不提交，由调用方 commit）"""
    conversation_ids = [row.id for row in db.query(Conversation.id).filter_by(group_id=group.id).all()]
    if conversation_ids:
        db.query(Message).filter(Message.conversation_id.in_(conversation_ids)).delete(synchronize_session=False)
        db.query(Conversation).filter(Conversation.id.in_(conversation_ids)).delete(synchronize_session=False)
    db.query(GroupMember).filter_by(group_id=group.id).delete(synchronize_session=False)
    db.delete(group)


def detach_character_from_groups(db: Session, character_id: int) -> None:
    """删除角色前调用：把它移出所有群，群聊历史里它说过的话保留、但不再关联到这个角色（不提交）"""
    db.query(GroupMember).filter_by(character_id=character_id).delete(synchronize_session=False)
    db.query(Message).filter_by(speaker_id=character_id).update({Message.speaker_id: None}, synchronize_session=False)
