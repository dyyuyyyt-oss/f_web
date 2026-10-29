"""
聊天业务服务层
处理聊天逻辑、数据库保存、AI 调用等
"""

import asyncio
from typing import AsyncGenerator, Optional
from app.core.config import settings
from app.services.ai_client import get_ai_client
from app.services.image_service import describe_image, ImageDescribeError
from app.prompts.character_prompt import get_system_prompt, get_example_prompt
from app.db.session import SessionLocal
from app.models import Conversation, Message, Character
from sqlalchemy.orm import Session
import logging


logger = logging.getLogger(__name__)

# 图片识别失败时的降级提示，直接告诉 AI 图片识别失败，让它引导用户用文字描述
IMAGE_DESCRIBE_FALLBACK = "用户发送了一张图片，但图片内容识别失败，请礼貌地让用户用文字描述一下"

# 发给 AI 的历史消息窗口大小（不含 system 消息），避免把全部历史都塞进去导致 token 爆炸
HISTORY_WINDOW_SIZE = 20


def _build_message_content_for_ai(content: str, image_description: Optional[str]) -> str:
    """
    把一条消息改写成发给 AI 的文本
    如果这条消息带图片描述，改写成"图片内容 + 用户文字"的复合文本；否则原样返回文字内容

    Args:
        content: 消息的原始文字（可能为空，即用户只发了图片没写字）
        image_description: 豆包生成的图片描述（或识别失败时的降级提示），没有图片则为 None

    Returns:
        发给 AI 的最终文本内容
    """
    if not image_description:
        return content

    if content:
        return f"[用户发送了一张图片]\n图片内容：{image_description}\n用户的文字：{content}"
    return f"[用户发送了一张图片]\n图片内容：{image_description}"


def _build_system_prompt(character, allow_emoji: bool) -> str:
    """
    构建这次对话使用的系统提示词：角色人设 + 示例对话 + 表情开关，合并成一条 system 消息

    Args:
        character: Character 模型实例
        allow_emoji: 是否允许 AI 回复中包含表情符号

    Returns:
        完整的系统提示词
    """
    system_prompt = get_system_prompt(character)

    example_prompt = get_example_prompt(character.example_dialogue if character else "")
    if example_prompt:
        system_prompt = f"{system_prompt}\n{example_prompt}"

    # emoji 是否允许由前端"允许表情回复"开关控制（默认允许），
    # 只有用户关闭时才在要求列表里追加"不要用 emoji"，不写死成任何情况下都禁止
    if not allow_emoji:
        system_prompt += "\n8. 不要用 emoji，改用动作描写传达情绪。"

    return system_prompt


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

    def _get_or_create_conversation(
        self, db: Session, user_id: int, character_id: int, character
    ) -> Conversation:
        """
        获取这个用户与这个角色最近的一次会话，没有则新建一个

        同一个用户和同一个角色的多轮对话要持续累积在同一个会话里，
        而不是每发一条消息就新建一个会话——否则历史记忆、开场白机制都没有意义

        Args:
            db: 数据库会话
            user_id: 用户 ID
            character_id: 角色 ID
            character: Character 模型实例，仅在需要新建会话时用来生成标题

        Returns:
            已存在或新建的 Conversation 实例
        """
        conversation = (
            db.query(Conversation)
            .filter_by(user_id=user_id, character_id=character_id)
            .order_by(Conversation.created_at.desc())
            .first()
        )
        if conversation:
            return conversation

        conversation = Conversation(
            user_id=user_id,
            character_id=character_id,
            title=f"与 {character.name} 的对话",
        )
        db.add(conversation)
        db.commit()
        db.refresh(conversation)
        return conversation

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

    async def _resolve_image_description(
        self, image_url: Optional[str], user_message: str
    ) -> Optional[str]:
        """
        如果这条消息带了图片，调用豆包获取图片描述；识别失败时降级返回固定提示，不抛出异常

        Args:
            image_url: 图片地址，没有图片则为 None
            user_message: 用户输入的文字，作为图片描述的额外提示

        Returns:
            图片描述文本（或失败时的降级提示）；没有图片则返回 None
        """
        if not image_url:
            return None

        try:
            return await describe_image(image_url, extra_hint=user_message)
        except ImageDescribeError as e:
            logger.error(f"图片识别失败，降级处理: {e}")
            return IMAGE_DESCRIBE_FALLBACK

    async def stream_chat(
        self,
        user_message: str,
        conversation_id: Optional[int] = None,
        character_id: int = 1,
        user_id: int = 1,
        allow_emoji: bool = True,
        image_url: Optional[str] = None,
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
            image_url: 用户发送的图片地址（可选）

        Yields:
            缓冲后的文本段落（包含完整词组或到达缓冲区大小）
        """
        db = self.get_db()
        # 用户中途点「停止」（客户端断开）时，要把已经生成的部分存下来，这几个变量记录进度
        user_msg_saved = False
        assistant_saved = False
        generated = ""

        try:
            # 角色信息在每次对话中都需要用来构建系统提示词，不只是新建会话时才查
            character = db.query(Character).filter_by(id=character_id).first()
            if not character:
                yield "[错误] 角色不存在"
                return

            # 如果没有提供对话 ID，复用该用户与该角色最近的会话（没有就新建），
            # 这样多轮对话会持续累积在同一个会话里，历史记忆和窗口截断才有意义
            if conversation_id is None:
                conversation = self._get_or_create_conversation(db, user_id, character_id, character)
                conversation_id = conversation.id

            # 如果带图片，先调用豆包获取图片描述（失败会降级，不影响后续流程）
            image_description = await self._resolve_image_description(image_url, user_message)

            # 保存用户消息到数据库：content 存原始文字，图片相关信息单独存列
            user_msg_db = Message(
                conversation_id=conversation_id,
                role="user",
                content=user_message,
                image_url=image_url,
                image_description=image_description,
            )
            db.add(user_msg_db)
            db.commit()
            user_msg_saved = True

            # 令牌缓冲相关变量
            buffer = ""
            punctuation_marks = "。！？；.!?;"
            buffer_size = settings.stream_buffer_size

            # 根据 USE_MOCK_AI 决定使用模拟还是真实 AI
            if settings.use_mock_ai:
                logger.info("Using mock AI response")
                async for chunk in self.mock_stream_response():
                    buffer += chunk
                    generated += chunk
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

                # 获取对话历史：只取最近 HISTORY_WINDOW_SIZE 条（含刚保存的这条用户消息），
                # 避免会话很长时把全部历史都塞给 AI 导致 token 爆炸
                messages_db = (
                    db.query(Message)
                    .filter_by(conversation_id=conversation_id)
                    .order_by(Message.created_at.desc())
                    .limit(HISTORY_WINDOW_SIZE)
                    .all()
                )
                messages_db.reverse()  # 按 created_at 倒序取的最近 N 条，这里转回正序

                # 构建消息列表：带图片的消息改写成"图片内容 + 用户文字"发给 AI
                history_messages = [
                    {
                        "role": msg.role,
                        "content": _build_message_content_for_ai(msg.content, msg.image_description),
                    }
                    for msg in messages_db
                ]

                # 系统提示词（角色人设 + 示例对话 + 表情开关）放在第一条，只有一条 system 消息
                system_prompt = _build_system_prompt(character, allow_emoji)
                messages = [{"role": "system", "content": system_prompt}] + history_messages

                # 流式获取 AI 回复，使用缓冲
                mock_response = ""
                async for chunk in client.stream_chat(messages):
                    buffer += chunk
                    mock_response += chunk
                    generated += chunk
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
            # （原来这里写的是 mock_response if settings.use_mock_ai else ""，
            #  用真实模型时存进去的是空字符串，刷新后角色的回复全都不见了）
            ai_msg_db = Message(
                conversation_id=conversation_id,
                role="assistant",
                content=mock_response,
            )
            db.add(ai_msg_db)
            db.commit()
            assistant_saved = True

        except (GeneratorExit, asyncio.CancelledError):
            # 客户端中途断开（前端点了「停止」或关掉页面）：已经生成的部分照样存下来，刷新后不会丢。
            # 这里只能做同步的数据库操作，不能再 yield
            if user_msg_saved and not assistant_saved and generated:
                try:
                    db.add(Message(conversation_id=conversation_id, role="assistant", content=generated))
                    db.commit()
                except Exception as save_error:
                    logger.error(f"Error saving partial reply after disconnect: {save_error}")
            raise
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
        image_url: Optional[str] = None,
    ) -> str:
        """
        非流式聊天接口，返回完整回复

        Args:
            user_message: 用户输入的消息
            conversation_id: 对话 ID（如果为 None，创建新对话）
            character_id: 角色 ID
            user_id: 用户 ID
            allow_emoji: 是否允许 AI 回复中包含表情符号（默认 True）
            image_url: 用户发送的图片地址（可选）

        Returns:
            AI 回复的完整文本
        """
        db = self.get_db()

        try:
            # 角色信息在每次对话中都需要用来构建系统提示词，不只是新建会话时才查
            character = db.query(Character).filter_by(id=character_id).first()
            if not character:
                raise ValueError("角色不存在")

            # 如果没有提供对话 ID，复用该用户与该角色最近的会话（没有就新建）
            if conversation_id is None:
                conversation = self._get_or_create_conversation(db, user_id, character_id, character)
                conversation_id = conversation.id

            # 如果带图片，先调用豆包获取图片描述（失败会降级，不影响后续流程）
            image_description = await self._resolve_image_description(image_url, user_message)

            # 保存用户消息到数据库：content 存原始文字，图片相关信息单独存列
            user_msg_db = Message(
                conversation_id=conversation_id,
                role="user",
                content=user_message,
                image_url=image_url,
                image_description=image_description,
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

                # 获取对话历史：只取最近 HISTORY_WINDOW_SIZE 条（含刚保存的这条用户消息）
                messages_db = (
                    db.query(Message)
                    .filter_by(conversation_id=conversation_id)
                    .order_by(Message.created_at.desc())
                    .limit(HISTORY_WINDOW_SIZE)
                    .all()
                )
                messages_db.reverse()  # 按 created_at 倒序取的最近 N 条，这里转回正序

                # 构建消息列表：带图片的消息改写成"图片内容 + 用户文字"发给 AI
                history_messages = [
                    {
                        "role": msg.role,
                        "content": _build_message_content_for_ai(msg.content, msg.image_description),
                    }
                    for msg in messages_db
                ]

                # 系统提示词（角色人设 + 示例对话 + 表情开关）放在第一条，只有一条 system 消息
                system_prompt = _build_system_prompt(character, allow_emoji)
                messages = [{"role": "system", "content": system_prompt}] + history_messages

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

    async def regenerate(
        self, conversation_id: int, user_id: int, allow_emoji: bool = True
    ) -> str:
        """
        重新生成回复：删除该会话最后一条 assistant 消息，基于剩下的历史（含最后一条 user 消息）
        重新调用 AI 生成新回复，不新增 user 消息记录，避免"重新生成"在历史里留下重复的用户消息

        Args:
            conversation_id: 会话 ID
            user_id: 当前登录用户 ID，用于校验会话归属，防止跨用户重新生成
            allow_emoji: 是否允许 AI 回复中包含表情符号（默认 True）

        Returns:
            新生成的 AI 回复文本

        Raises:
            ValueError: 会话不存在、角色不存在，或该会话没有可重新生成的回复
            PermissionError: 该会话不属于当前登录用户
        """
        db = self.get_db()
        try:
            conversation = db.query(Conversation).filter_by(id=conversation_id).first()
            if not conversation:
                raise ValueError("会话不存在")
            if conversation.user_id != user_id:
                raise PermissionError("无权操作该会话")

            character = db.query(Character).filter_by(id=conversation.character_id).first()
            if not character:
                raise ValueError("角色不存在")

            # 只有当会话最后一条消息确实是 assistant 回复时才允许重新生成，
            # 删除它之后，剩下的最后一条消息自然就是用来重新生成的那条 user 消息
            last_message = (
                db.query(Message)
                .filter_by(conversation_id=conversation_id)
                .order_by(Message.created_at.desc())
                .first()
            )
            if not last_message or last_message.role != "assistant":
                raise ValueError("当前会话没有可重新生成的回复")

            db.delete(last_message)
            db.commit()

            if settings.use_mock_ai:
                ai_response = (
                    "你好！很高兴认识你。\n\n"
                    "我是一个 AI 助手，很乐意与你进行对话。\n\n"
                    "请问有什么我可以帮你的吗？"
                )
            else:
                client = get_ai_client()

                # 获取删除后剩下的历史（含最后一条 user 消息），逻辑与 chat()/stream_chat() 保持一致
                messages_db = (
                    db.query(Message)
                    .filter_by(conversation_id=conversation_id)
                    .order_by(Message.created_at.desc())
                    .limit(HISTORY_WINDOW_SIZE)
                    .all()
                )
                messages_db.reverse()

                history_messages = [
                    {
                        "role": msg.role,
                        "content": _build_message_content_for_ai(msg.content, msg.image_description),
                    }
                    for msg in messages_db
                ]

                system_prompt = _build_system_prompt(character, allow_emoji)
                messages = [{"role": "system", "content": system_prompt}] + history_messages

                ai_response = await client.chat(messages)

            # 保存新的 AI 回复到数据库
            ai_msg_db = Message(
                conversation_id=conversation_id,
                role="assistant",
                content=ai_response,
            )
            db.add(ai_msg_db)
            db.commit()

            return ai_response
        except (ValueError, PermissionError):
            raise
        except Exception as e:
            logger.error(f"Error in regenerate: {e}")
            raise
        finally:
            self.close_db()

    async def ensure_greeting(self, conversation_id: int, character) -> Optional[Message]:
        """
        确保这个会话有开场白：如果该会话还没有任何 assistant 消息，
        把角色的 greeting 作为第一条 assistant 消息写入数据库
        （参考星野：用户一进入对话就能看到角色主动说话）

        Args:
            conversation_id: 会话 ID
            character: Character 模型实例

        Returns:
            新插入的开场白 Message；如果会话已经有 assistant 消息了，返回 None（不重复插入）
        """
        db = self.get_db()

        existing_assistant_msg = (
            db.query(Message)
            .filter_by(conversation_id=conversation_id, role="assistant")
            .first()
        )
        if existing_assistant_msg:
            return None

        # 角色没填开场白时，生成一句通用的默认开场白
        greeting_text = character.greeting or f"（微笑）你好，我是{character.name}，有什么想聊的吗？"

        greeting_msg = Message(
            conversation_id=conversation_id,
            role="assistant",
            content=greeting_text,
        )
        db.add(greeting_msg)
        db.commit()
        db.refresh(greeting_msg)
        return greeting_msg

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
