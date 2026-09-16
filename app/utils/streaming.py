"""
SSE (Server-Sent Events) 流式响应工具
"""

from sse_starlette.sse import EventSourceResponse
from typing import AsyncGenerator
import asyncio


async def stream_response(
    async_gen: AsyncGenerator[str, None],
) -> EventSourceResponse:
    """
    将异步生成器转换为 SSE 事件流

    Args:
        async_gen: 异步生成器，每次 yield 返回一段文本

    Returns:
        EventSourceResponse 实例（SSE 格式）
    """

    async def event_generator():
        """事件生成器"""
        try:
            async for chunk in async_gen:
                # 以 "data: " 前缀发送每个 chunk
                yield {
                    "event": "message",
                    "data": chunk,
                }
            # 发送完成事件 (可选)
            yield {
                "event": "done",
                "data": "[DONE]",
            }
        except Exception as e:
            yield {
                "event": "error",
                "data": f"Error: {str(e)}",
            }

    return EventSourceResponse(event_generator())
