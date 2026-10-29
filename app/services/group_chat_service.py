"""
群聊发言：用户说一句 → 群里的角色按发言顺序依次各说一段

- 串行调用：后面的角色能看到前面角色这一轮刚说的话（并行就做不到"接话"）
- 一轮最多 max_speakers 个角色（默认 GROUP_MAX_SPEAKERS），超过成员数就全说；一轮 = N 次模型调用
- 单个角色失败（模型报错、网络错误）只跳过这个角色，继续下一个，不会整轮失败
- 用户中途点「停止」（客户端断开）：当前角色已说出的部分照样保存，后面的角色不再发言
- 单角色聊天的逻辑（chat_service.py）完全不动

SSE 事件（每个事件一行 JSON）：
  {"type":"start","conversation_id":12,"user_message_id":34}
  {"type":"speaker_start","speaker":{"id":3,"name":"丝柯克","avatar":"..."},"index":0}
  {"type":"content","speaker_id":3,"text":"（看了你一眼）"}
  {"type":"speaker_end","speaker_id":3,"message_id":35}
  {"type":"error","speaker_id":5,"message":"..."}      ← 某个角色失败；不带 speaker_id 表示整轮出错
  {"type":"done","spoken":[3,5],"usage":null}           ← 当前 AI 客户端不回传 token 用量，所以 usage 为 null
两次事件之间超过 GROUP_HEARTBEAT_SECONDS 秒没有数据时，发一行 SSE 注释 ": ping" 保持连接（浏览器会忽略）
"""

import asyncio
import json
import logging
from datetime import datetime
from typing import AsyncGenerator, AsyncIterator, List, Optional, Tuple

from app.core.config import settings
from app.db.session import SessionLocal
from app.models import Character, Group, Message
from app.services.ai_client import get_ai_client
from app.services.chat_service import _build_system_prompt
from app.services.group_service import get_group_conversation, ordered_members

logger = logging.getLogger(__name__)

# 发给模型的群聊历史条数（含这一轮已经说过的话）
GROUP_HISTORY_WINDOW = 30
USER_PREFIX = "我"
DELETED_SPEAKER = "（已删除的角色）"


def sse_event(payload: dict) -> str:
    """一个 SSE 事件；json.dumps 会把换行转义掉，所以永远只占一行 data"""
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def _group_rules(name: str, member_names: List[str]) -> str:
    members_text = "、".join(member_names)
    return (
        f"\n你现在在一个多人聊天群里，群成员有：用户、{members_text}（你是 {name}）。"
        "\n只写你自己这一段，简短（1~3 句），不要替别人说话，"
        "\n不要复述别人刚说过的内容，不要旁白式地描述整个场面。"
        f"\n直接说你要说的话，开头不要写「{name}：」。"
    )


async def _with_heartbeat(source: AsyncIterator[str], interval: float) -> AsyncGenerator[Tuple[str, Optional[str]], None]:
    """
    给异步生成器加心跳：每隔 interval 秒没有新内容就产出一次 ("ping", None)，有内容产出 ("chunk", 文本)。
    下一段内容在单独的 task 里等待，超时只是"先报一次心跳"，不会打断正在进行的模型调用
    """
    iterator = source.__aiter__()
    pending = asyncio.ensure_future(iterator.__anext__())
    try:
        while True:
            done, _ = await asyncio.wait({pending}, timeout=interval)
            if not done:
                yield ("ping", None)
                continue
            try:
                chunk = pending.result()
            except StopAsyncIteration:
                return
            yield ("chunk", chunk)
            pending = asyncio.ensure_future(iterator.__anext__())
    finally:
        if not pending.done():
            pending.cancel()  # 客户端断开时停止当前角色的模型调用


class GroupChatService:
    """群聊发言服务；每次请求新建一个实例"""

    def _build_messages(self, db, conversation_id: int, character: Character, member_names: List[str], allow_emoji: bool) -> List[dict]:
        """
        第 i 个角色的 prompt：
        system = 角色自己的人设（和单聊同一套）+ 群聊规则
        历史里每条都带说话人前缀：用户 → "我：…"（user），每个角色 → "名字：…"（assistant，别人说的话也当 assistant）
        如果最后一条不是 user（前面已有角色这一轮说过话），追加一条不入库的 user 提示，
        让最后一条始终是 user——部分 OpenAI 兼容接口在最后一条是 assistant 时会当成续写或直接报错
        """
        rows = (
            db.query(Message, Character)
            .outerjoin(Character, Character.id == Message.speaker_id)
            .filter(Message.conversation_id == conversation_id)
            .order_by(Message.created_at.desc(), Message.id.desc())
            .limit(GROUP_HISTORY_WINDOW)
            .all()
        )
        rows.reverse()
        history = []
        for msg, speaker in rows:
            if not msg.content:
                continue
            if msg.role == "user":
                history.append({"role": "user", "content": f"{USER_PREFIX}：{msg.content}"})
            else:
                history.append({"role": "assistant", "content": f"{speaker.name if speaker else DELETED_SPEAKER}：{msg.content}"})
        if not history or history[-1]["role"] != "user":
            last_user = next((m.content for m, _ in reversed(rows) if m.role == "user" and m.content), "")
            hint = f"可以回应我刚才说的「{last_user[:60]}」，也可以接其他人的话。" if last_user else ""
            history.append({"role": "user", "content": f"（轮到你（{character.name}）发言了。{hint}）"})
        system_prompt = _build_system_prompt(character, allow_emoji) + _group_rules(character.name, member_names)
        return [{"role": "system", "content": system_prompt}] + history

    def _reply_source(self, messages: List[dict], character: Character) -> AsyncIterator[str]:
        if settings.use_mock_ai:
            async def mock():
                for piece in [f"（{character.name}点点头）", "这是模拟回复。"]:
                    await asyncio.sleep(0.05)
                    yield piece
            return mock()
        return get_ai_client().stream_chat(messages)

    async def stream(
        self,
        group_id: int,
        message: str,
        allow_emoji: bool = True,
        max_speakers: Optional[int] = None,
    ) -> AsyncGenerator[str, None]:
        """群聊一轮的 SSE 流。群归属、成员是否为空由路由在开始流式之前校验"""
        db = SessionLocal()
        current: Optional[Character] = None  # 正在发言的角色
        current_text = ""
        current_saved = True
        conversation_id = None
        try:
            group = db.query(Group).filter_by(id=group_id).first()
            members = [character for _, character in ordered_members(db, group_id)]
            conversation = get_group_conversation(db, group, create=True)
            conversation_id = conversation.id

            now = datetime.utcnow()
            user_message = Message(conversation_id=conversation_id, role="user", content=message)
            db.add(user_message)
            conversation.updated_at = now
            group.updated_at = now
            db.commit()
            yield sse_event({"type": "start", "conversation_id": conversation_id, "user_message_id": user_message.id})

            limit = max_speakers or settings.group_max_speakers
            speakers = members[: min(limit, len(members))]
            member_names = [c.name for c in members]
            spoken = []

            for index, character in enumerate(speakers):
                current, current_text, current_saved = character, "", False
                yield sse_event({
                    "type": "speaker_start",
                    "speaker": {"id": character.id, "name": character.name, "avatar": character.avatar},
                    "index": index,
                })
                error_text = None
                try:
                    messages = self._build_messages(db, conversation_id, character, member_names, allow_emoji)
                    # 模型偶尔还是会以「名字：」开头：先攒住开头几个字，确认不是前缀再往外发
                    prefixes = (f"{character.name}：", f"{character.name}:")
                    held = ""
                    async for kind, chunk in _with_heartbeat(self._reply_source(messages, character), settings.group_heartbeat_seconds):
                        if kind == "ping":
                            yield ": ping\n\n"
                            continue
                        if chunk.startswith("[错误]"):  # AI 客户端出错时把错误当成文字吐出来
                            error_text = chunk
                            break
                        if held is not None:
                            held += chunk
                            if len(held) < len(prefixes[0]) and any(p.startswith(held) for p in prefixes):
                                continue  # 还判断不了是不是前缀，先攒着
                            for p in prefixes:
                                if held.startswith(p):
                                    held = held[len(p):].lstrip()
                                    break
                            chunk, held = held, None
                            if not chunk:
                                continue
                        current_text += chunk
                        yield sse_event({"type": "content", "speaker_id": character.id, "text": chunk})
                    if held:  # 整段回复比前缀还短
                        current_text += held
                        yield sse_event({"type": "content", "speaker_id": character.id, "text": held})
                except (GeneratorExit, asyncio.CancelledError):
                    raise
                except Exception as e:
                    logger.error(f"Group {group_id} speaker {character.id} failed: {e}")
                    error_text = f"[错误] {e}"

                message_id = None
                if current_text:
                    reply = Message(conversation_id=conversation_id, role="assistant", content=current_text, speaker_id=character.id)
                    db.add(reply)
                    db.commit()
                    message_id = reply.id
                    spoken.append(character.id)
                current_saved = True
                if error_text:
                    yield sse_event({"type": "error", "speaker_id": character.id, "message": f"{character.name} 没能发言：{error_text}"})
                yield sse_event({"type": "speaker_end", "speaker_id": character.id, "message_id": message_id})

            current = None
            yield sse_event({"type": "done", "spoken": spoken, "usage": None})

        except (GeneratorExit, asyncio.CancelledError):
            # 用户点了「停止」：当前角色已经说出的部分保存下来，后面的角色不再发言
            if current is not None and current_text and not current_saved and conversation_id is not None:
                try:
                    db.add(Message(conversation_id=conversation_id, role="assistant", content=current_text, speaker_id=current.id))
                    db.commit()
                except Exception as save_error:
                    logger.error(f"Error saving partial group reply after disconnect: {save_error}")
            raise
        except Exception as e:
            logger.error(f"Error in group chat {group_id}: {e}")
            yield sse_event({"type": "error", "message": f"群聊出错：{e}"})
        finally:
            db.close()
