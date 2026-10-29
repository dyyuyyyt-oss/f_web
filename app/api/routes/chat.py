"""
聊天路由
处理聊天请求和流式响应
"""

from fastapi import APIRouter, Depends, Query, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import Optional
from app.db.session import get_db
from app.schemas.chat import (
    ChatMessageInput,
    ChatSendResponse,
    RegenerateRequest,
    ContinueRequest,
    ClearHistoryResponse,
    ChatHistoryResponse,
)
from app.services.chat_service import ChatService
from app.utils.sse import sse_data
from app.models import Character, Conversation, Message
from app.api.deps import get_current_user
from app.models.user import User
import logging

router = APIRouter(prefix="/chat", tags=["聊天"])
logger = logging.getLogger(__name__)


@router.get("/stream", tags=["聊天"], summary="流式聊天", description="通过 SSE 返回 AI 流式回复，支持 DeepSeek 和火山引擎方舟")
async def stream_chat(
    # 允许空字符串：用户可以只发图片不写文字，此时 image_url 必须非空
    message: str = Query(..., max_length=4096),
    character_id: int = Query(default=1, gt=0),
    conversation_id: int = Query(default=None, gt=0),
    allow_emoji: bool = Query(default=True, description="是否允许 AI 回复中包含表情符号"),
    image_url: str = Query(default=None, description="用户发送的图片地址，可选"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    流式聊天端点
    以 SSE (Server-Sent Events) 格式返回 AI 的实时回复

    Query 参数：
    - message: 用户的消息（必需）
    - character_id: 角色 ID（默认为 1）
    - conversation_id: 对话 ID（可选，不提供则创建新对话）
    - allow_emoji: 是否允许 AI 回复中包含表情符号（默认 True）
    - image_url: 用户发送的图片地址（可选）

    用户身份从登录令牌中获取，不再信任客户端传入的 user_id

    示例：
    GET /api/chat/stream?message=你好&character_id=1

    返回格式 (SSE)：
    data: 你
    data: 好
    data: ！
    ...
    """
    chat_service = ChatService()

    try:
        # 创建异步生成器
        async def generate():
            async for chunk in chat_service.stream_chat(
                user_message=message,
                conversation_id=conversation_id,
                character_id=character_id,
                user_id=current_user.id,
                allow_emoji=allow_emoji,
                image_url=image_url,
            ):
                yield sse_data(chunk)

        return StreamingResponse(
            generate(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
            },
        )

    except Exception as e:
        logger.error(f"Error in stream_chat: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/send", tags=["聊天"], summary="发送消息", description="发送一条消息并返回完整回复，支持 DeepSeek 和火山引擎方舟")
async def send_message(
    request: ChatMessageInput,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    发送消息（非流式）
    返回 AI 的完整回复，包含对话 ID 和角色 ID

    用户身份从登录令牌中获取，不再信任客户端传入的 user_id

    Args:
        request: ChatMessageInput 请求体

    Returns:
        ChatSendResponse: 包含 AI 回复、角色 ID、会话 ID
    """
    try:
        # 验证角色是否存在
        character = db.query(Character).filter_by(id=request.character_id).first()
        if not character:
            raise HTTPException(
                status_code=404,
                detail=f"角色 ID {request.character_id} 不存在",
            )

        # 调用聊天服务获取 AI 回复
        chat_service = ChatService()
        reply = await chat_service.chat(
            user_message=request.message,
            character_id=request.character_id,
            user_id=current_user.id,
            allow_emoji=request.allow_emoji,
            image_url=request.image_url,
        )

        # 获取最新创建的对话 ID（聊天服务已创建或返回现有会话）
        conversation = (
            db.query(Conversation)
            .filter_by(
                user_id=current_user.id,
                character_id=request.character_id,
            )
            .order_by(Conversation.created_at.desc())
            .first()
        )

        if not conversation:
            raise HTTPException(
                status_code=500,
                detail="创建对话失败",
            )

        return ChatSendResponse(
            reply=reply,
            character_id=request.character_id,
            conversation_id=conversation.id,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in send_message: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"发送消息失败: {str(e)}",
        )


@router.get(
    "/history",
    tags=["聊天"],
    response_model=ChatHistoryResponse,
    summary="获取聊天历史",
    description="返回当前登录用户与指定角色对应的会话 ID，以及历史消息（按时间正序）；如果还没有任何消息，会自动插入角色开场白作为第一条消息。",
    responses={
        200: {"description": "返回会话 ID 和历史消息列表"},
        404: {"description": "角色不存在"},
        500: {"description": "服务器内部错误，获取聊天历史失败"},
    },
)
async def get_chat_history(
    character_id: int = Query(..., gt=0, description="角色 ID"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    获取当前登录用户与指定角色的聊天历史
    用户与角色的多轮对话都累积在同一个会话里，还没有会话时会自动新建并插入开场白

    响应体带上 conversation_id，前端切换角色后可以直接拿它去调用 regenerate / 清空历史等接口，
    不用再从 messages 数组里"猜"第一条消息的 conversation_id（消息列表为空时也无从猜起）

    Args:
        character_id: 角色 ID

    Returns:
        ChatHistoryResponse: 会话 ID + 按时间正序排列的历史消息列表
    """
    try:
        character = db.query(Character).filter_by(id=character_id).first()
        if not character:
            raise HTTPException(status_code=404, detail="角色不存在")

        chat_service = ChatService()
        try:
            svc_db = chat_service.get_db()
            conversation = chat_service._get_or_create_conversation(
                svc_db, current_user.id, character_id, character
            )
            await chat_service.ensure_greeting(conversation.id, character)
        finally:
            chat_service.close_db()

        messages = (
            db.query(Message)
            .filter_by(conversation_id=conversation.id)
            .order_by(Message.created_at)
            .all()
        )
        return ChatHistoryResponse(conversation_id=conversation.id, messages=messages)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching chat history: {e}")
        raise HTTPException(status_code=500, detail="获取聊天历史失败")


@router.post(
    "/regenerate",
    tags=["聊天"],
    response_model=ChatSendResponse,
    summary="重新生成回复",
    description="删除指定会话最后一条 assistant 回复，基于剩下的历史（含最后一条 user 消息）重新调用 AI 生成新回复，不会新增用户消息记录。",
    responses={
        200: {"description": "重新生成成功，返回新的 AI 回复"},
        403: {"description": "该会话不属于当前登录用户"},
        404: {"description": "会话不存在，或会话内没有可重新生成的回复"},
        500: {"description": "服务器内部错误，重新生成回复失败"},
    },
)
async def regenerate_message(
    request: RegenerateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    重新生成会话最后一条 AI 回复

    Args:
        request: 包含 conversation_id（要重新生成的会话）和 allow_emoji 开关

    Returns:
        ChatSendResponse: 新的 AI 回复内容、角色 ID、会话 ID
    """
    # 先查一次会话是否存在，不存在直接 404，比进服务层再报错更直观
    conversation = db.query(Conversation).filter_by(id=request.conversation_id).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="会话不存在")

    chat_service = ChatService()
    try:
        reply = await chat_service.regenerate(
            conversation_id=request.conversation_id,
            user_id=current_user.id,
            allow_emoji=request.allow_emoji,
        )
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error in regenerate_message: {e}")
        raise HTTPException(status_code=500, detail="重新生成回复失败")

    return ChatSendResponse(
        reply=reply,
        character_id=conversation.character_id,
        conversation_id=conversation.id,
    )


@router.post(
    "/continue",
    tags=["聊天"],
    summary="续写（SSE）",
    description="让角色接着最后一条回复继续往下写：不新增任何消息，新内容追加到最后一条 assistant 消息上。"
    "返回格式与 /api/chat/stream 相同（SSE，每个事件是一段文字）。",
    responses={
        200: {"description": "SSE 流，逐段返回续写内容"},
        400: {"description": "最后一条不是角色的回复（或内容为空），无法续写"},
        403: {"description": "该会话不属于当前登录用户"},
        404: {"description": "会话不存在"},
    },
)
async def continue_message(
    request: ContinueRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """续写最后一条 AI 回复（SSE）。所有校验都在开始流式之前做完，不满足条件直接返回 4xx"""
    conversation = db.query(Conversation).filter_by(id=request.conversation_id).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="会话不存在")
    if conversation.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="无权操作该会话")

    last_message = (
        db.query(Message)
        .filter_by(conversation_id=conversation.id)
        .order_by(Message.created_at.desc(), Message.id.desc())
        .first()
    )
    if not last_message or last_message.role != "assistant" or not last_message.content:
        raise HTTPException(status_code=400, detail="最后一条不是角色的回复，无法续写")

    chat_service = ChatService()

    async def generate():
        async for chunk in chat_service.continue_reply(
            conversation_id=conversation.id,
            allow_emoji=request.allow_emoji,
        ):
            yield sse_data(chunk)

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )


@router.delete(
    "/history",
    tags=["聊天"],
    response_model=ClearHistoryResponse,
    summary="清空聊天历史",
    description="删除指定会话（或当前登录用户与指定角色的会话）下的全部消息记录，但保留会话本身；用于前端“清空对话”按钮真正落盘生效，而不只是清空页面显示。",
    responses={
        200: {"description": "清空成功，返回删除的消息条数"},
        400: {"description": "conversation_id 和 character_id 都未提供"},
        403: {"description": "该会话不属于当前登录用户"},
        404: {"description": "conversation_id 指定的会话不存在"},
        500: {"description": "服务器内部错误，清空聊天历史失败"},
    },
)
async def clear_chat_history(
    conversation_id: Optional[int] = Query(default=None, gt=0, description="要清空的会话 ID"),
    character_id: Optional[int] = Query(default=None, gt=0, description="按角色清空：清空当前登录用户与该角色的会话"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    清空聊天历史（删除消息记录，保留会话本身）

    用户身份始终从登录令牌获取，不接受客户端传入 user_id，
    避免出现"传别人的 character_id/conversation_id 清空别人历史"的越权问题

    Args:
        conversation_id: 要清空的会话 ID（与 character_id 二选一）
        character_id: 角色 ID，清空当前用户与该角色的会话（与 conversation_id 二选一）

    Returns:
        ClearHistoryResponse: 本次删除的消息条数
    """
    if not conversation_id and not character_id:
        raise HTTPException(status_code=400, detail="必须提供 conversation_id 或 character_id 其中之一")

    if conversation_id:
        conversation = db.query(Conversation).filter_by(id=conversation_id).first()
        if not conversation:
            raise HTTPException(status_code=404, detail="会话不存在")
        if conversation.user_id != current_user.id:
            raise HTTPException(status_code=403, detail="无权操作该会话")
    else:
        conversation = (
            db.query(Conversation)
            .filter_by(user_id=current_user.id, character_id=character_id)
            .order_by(Conversation.created_at.desc())
            .first()
        )
        if not conversation:
            # 当前用户与该角色还没有任何会话，视为已经是"空"的，直接返回 0
            return ClearHistoryResponse(deleted=0)

    try:
        deleted = (
            db.query(Message)
            .filter_by(conversation_id=conversation.id)
            .delete()
        )
        db.commit()
        return ClearHistoryResponse(deleted=deleted)
    except Exception as e:
        logger.error(f"Error clearing chat history: {e}")
        raise HTTPException(status_code=500, detail="清空聊天历史失败")
