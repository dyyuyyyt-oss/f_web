"""
聊天业务服务层
处理聊天逻辑、数据库保存、AI 调用等
"""

import asyncio
from typing import AsyncGenerator, Optional
from app.core.config import settings
from app.services.ai_client import get_ai_client
from app.db.session import SessionLocal
from app.models import Conversation, Message, Character
from sqlalchemy.orm import Session
import logging


logger = logging.getLogger(__name__)


class ChatService:
    """聊天服务"""

    def __init__(self):
        self.db: Optional[Session] = None

    def get_db(self) -> Session:
        """获取数据库会话"""
        if self.db is None:
            self.db = SessionLocal()
        return self.db

    def close_db(self) -> None:
        """关闭数据库会话"""
        if self.db:
            self.db.close()

    async def mock_stream_response(self) -> AsyncGenerator[str, None]:
        """
        生成模拟的 SSE 流式响应
        模拟打字机效果，逐字或逐段返回文本
        """
        # 模拟回复文本
        mock_text = (
            "你好！很高兴认识你。\n\n"
            "我是一个 AI 助手，很乐意与你进行对话。\n\n"
            "请问有什么我可以帮你的吗？"
        )

        # 逐段（以空格或句号分割）返回，模拟打字机效果
        for char in mock_text:
            yield char
            # 每个字符之间等待 10ms，模拟打字延迟
            await asyncio.sleep(0.01)

    async def stream_chat(
        self,
        user_message: str,
        conversation_id: Optional[int] = None,
        character_id: int = 1,
        user_id: int = 1,
        allow_emoji: bool = True,
    ) -> AsyncGenerator[str, None]:
        """
        流式聊天接口，带有令牌缓冲功能
        根据 USE_MOCK_AI 配置决定是使用模拟流还是真实 API
        当缓冲区达到 STREAM_BUFFER_SIZE 或包含句末标点时，一次性发送

        Args:
            user_message: 用户输入的消息
            conversation_id: 对话 ID（如果为 None，创建新对话）
            character_id: 角色 ID
            user_id: 用户 ID
            allow_emoji: 是否允许 AI 回复中包含表情符号（默认 True）

        Yields:
            缓冲后的文本段落（包含完整词组或到达缓冲区大小）
        """
        db = self.get_db()

        try:
            # 如果没有提供对话 ID，创建新对话
            if conversation_id is None:
                character = db.query(Character).filter_by(id=character_id).first()
                if not character:
                    yield "[错误] 角色不存在"
                    return

                conversation = Conversation(
                    user_id=user_id,
                    character_id=character_id,
                    title=f"与 {character.name} 的对话",
                )
                db.add(conversation)
                db.commit()
                db.refresh(conversation)
                conversation_id = conversation.id

            # 保存用户消息到数据库
            user_msg_db = Message(
                conversation_id=conversation_id,
                role="user",
                content=user_message,
            )
            db.add(user_msg_db)
            db.commit()

            # 令牌缓冲相关变量
            buffer = ""
            punctuation_marks = "。！？；.!?;"
            buffer_size = settings.stream_buffer_size

            # 根据 USE_MOCK_AI 决定使用模拟还是真实 AI
            if settings.use_mock_ai:
                logger.info("Using mock AI response")
                async for chunk in self.mock_stream_response():
                    buffer += chunk
                    # 检查是否应该发送缓冲区
                    if (
                        len(buffer) >= buffer_size
                        or any(p in buffer for p in punctuation_marks)
                    ):
                        yield buffer
                        buffer = ""
                # 模拟响应的完整文本
                mock_response = (
                    "你好！很高兴认识你。\n\n"
                    "我是一个 AI 助手，很乐意与你进行对话。\n\n"
                    "请问有什么我可以帮你的吗？"
                )
            else:
                logger.info(f"Using real AI: {settings.ai_provider}")
                # 调用真实 AI API
                client = get_ai_client()

                # 获取对话历史
                messages_db = (
                    db.query(Message)
                    .filter_by(conversation_id=conversation_id)
                    .order_by(Message.created_at)
                    .all()
                )

                # 构建消息列表
                messages = [
                    {"role": msg.role, "content": msg.content} for msg in messages_db
                ]

                # 用户关闭表情开关时，通过系统提示词禁止 AI 使用表情符号
                if not allow_emoji:
                    messages = [
                        {"role": "system", "content": "请不要在回复中使用任何表情符号（emoji）。"}
                    ] + messages

                # 流式获取 AI 回复，使用缓冲
                mock_response = ""
                async for chunk in client.stream_chat(messages):
                    buffer += chunk
                    mock_response += chunk
                    # 检查是否应该发送缓冲区
                    if (
                        len(buffer) >= buffer_size
                        or any(p in buffer for p in punctuation_marks)
                    ):
                        yield buffer
                        buffer = ""

            # 发送剩余缓冲区内容
            if buffer:
                yield buffer

            # 保存 AI 回复到数据库
            ai_msg_db = Message(
                conversation_id=conversation_id,
                role="assistant",
                content=mock_response if settings.use_mock_ai else "",
            )
            db.add(ai_msg_db)
            db.commit()

        except Exception as e:
            logger.error(f"Error in stream_chat: {e}")
            yield f"[错误] 发生异常: {str(e)}"
        finally:
            self.close_db()

    async def chat(
        self,
        user_message: str,
        conversation_id: Optional[int] = None,
        character_id: int = 1,
        user_id: int = 1,
        allow_emoji: bool = True,
    ) -> str:
        """
        非流式聊天接口，返回完整回复

        Args:
            user_message: 用户输入的消息
            conversation_id: 对话 ID（如果为 None，创建新对话）
            character_id: 角色 ID
            user_id: 用户 ID
            allow_emoji: 是否允许 AI 回复中包含表情符号（默认 True）

        Returns:
            AI 回复的完整文本
        """
        db = self.get_db()

        try:
            # 如果没有提供对话 ID，创建新对话
            if conversation_id is None:
                character = db.query(Character).filter_by(id=character_id).first()
                if not character:
                    raise ValueError("角色不存在")

                conversation = Conversation(
                    user_id=user_id,
                    character_id=character_id,
                    title=f"与 {character.name} 的对话",
                )
                db.add(conversation)
                db.commit()
                db.refresh(conversation)
                conversation_id = conversation.id

            # 保存用户消息到数据库
            user_msg_db = Message(
                conversation_id=conversation_id,
                role="user",
                content=user_message,
            )
            db.add(user_msg_db)
            db.commit()

            # 根据 USE_MOCK_AI 决定使用模拟还是真实 AI
            if settings.use_mock_ai:
                logger.info("Using mock AI response")
                ai_response = (
                    "你好！很高兴认识你。\n\n"
                    "我是一个 AI 助手，很乐意与你进行对话。\n\n"
                    "请问有什么我可以帮你的吗？"
                )
            else:
                logger.info(f"Using real AI: {settings.ai_provider}")
                # 调用真实 AI API
                client = get_ai_client()

                # 获取对话历史
                messages_db = (
                    db.query(Message)
                    .filter_by(conversation_id=conversation_id)
                    .order_by(Message.created_at)
                    .all()
                )

                # 构建消息列表
                messages = [
                    {"role": msg.role, "content": msg.content} for msg in messages_db
                ]

                # 用户关闭表情开关时，通过系统提示词禁止 AI 使用表情符号
                if not allow_emoji:
                    messages = [
                        {"role": "system", "content": "请不要在回复中使用任何表情符号（emoji）。"}
                    ] + messages

                # 获取完整 AI 回复
                ai_response = await client.chat(messages)

            # 保存 AI 回复到数据库
            ai_msg_db = Message(
                conversation_id=conversation_id,
                role="assistant",
                content=ai_response,
            )
            db.add(ai_msg_db)
            db.commit()

            return ai_response

        except Exception as e:
            logger.error(f"Error in chat: {e}")
            raise
        finally:
            self.close_db()

    async def get_conversation_history(
        self, conversation_id: int
    ) -> list[dict[str, str]]:
        """
        获取对话历史

        Args:
            conversation_id: 对话 ID

        Returns:
            消息列表
        """
        db = self.get_db()
        try:
            messages = (
                db.query(Message)
                .filter_by(conversation_id=conversation_id)
                .order_by(Message.created_at)
                .all()
            )
            return [
                {"role": msg.role, "content": msg.content} for msg in messages
            ]
        finally:
            self.close_db()

    def create_conversation(
        self, user_id: int, character_id: int, title: str
    ) -> Conversation:
        """
        创建新对话

        Args:
            user_id: 用户 ID
            character_id: 角色 ID
            title: 对话标题

        Returns:
            新建的 Conversation 实例
        """
        db = self.get_db()
        try:
            conversation = Conversation(
                user_id=user_id,
                character_id=character_id,
                title=title,
            )
            db.add(conversation)
            db.commit()
            db.refresh(conversation)
            return conversation
        finally:
            self.close_db()
