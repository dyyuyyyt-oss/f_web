"""
聊天路由
处理聊天请求和流式响应
"""

from fastapi import APIRouter, Depends, Query, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import List
from app.db.session import get_db
from app.schemas.chat import ChatMessageInput, ChatSendResponse, MessageSchema
from app.services.chat_service import ChatService
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
                yield f"data: {chunk}\n\n"

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
    response_model=List[MessageSchema],
    summary="获取聊天历史",
    description="返回当前登录用户与指定角色的历史消息（按时间正序）；如果还没有任何消息，会自动插入角色开场白作为第一条消息。",
    responses={
        200: {"description": "返回历史消息列表"},
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

    Args:
        character_id: 角色 ID

    Returns:
        按时间正序排列的历史消息列表
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
        return messages
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching chat history: {e}")
        raise HTTPException(status_code=500, detail="获取聊天历史失败")
