"""
图片理解服务
使用豆包 Seed 2.1 Pro（通过火山引擎方舟调用）描述图片内容，供聊天时注入对话上下文
"""

import asyncio
import logging
from openai import AsyncOpenAI
from app.core.config import settings

logger = logging.getLogger(__name__)


class ImageDescribeError(Exception):
    """图片描述失败（超时、API 错误、图片无法访问、配置缺失等）"""


def _build_prompt(extra_hint: str = "") -> str:
    """
    构建描述图片的提示词

    Args:
        extra_hint: 用户对这张图的额外文字说明，非空时追加到提示词末尾

    Returns:
        完整的提示词文本
    """
    prompt = (
        "请描述这张图片，内容包括：画面的主体是什么、所处的场景和色调氛围、"
        "画面中出现的文字（如果有）、人物的表情动作和衣着（如果有）。"
        "请用一段连贯的中文描述，不要分点列举，不要使用 Markdown 格式。"
    )
    if extra_hint:
        prompt += f"\n用户对这张图的额外说明：{extra_hint}"
    return prompt


async def describe_image(image_url: str, extra_hint: str = "") -> str:
    """
    调用豆包 Seed 2.1 Pro 描述图片内容

    Args:
        image_url: 图片的可访问地址
        extra_hint: 用户对这张图的额外文字说明（可选），会追加到提示词末尾

    Returns:
        豆包生成的图片描述文本

    Raises:
        ImageDescribeError: 配置缺失、超时或 API 调用失败时抛出
    """
    if not settings.doubao_api_key or not settings.doubao_model:
        raise ImageDescribeError("豆包图片识别未配置 API Key 或接入点 ID")

    client = AsyncOpenAI(api_key=settings.doubao_api_key, base_url=settings.doubao_base_url)

    # 豆包的多模态输入格式：content 是数组，包含文本片段和图片片段
    messages = [
        {
            "role": "user",
            "content": [
                {"type": "text", "text": _build_prompt(extra_hint)},
                {"type": "image_url", "image_url": {"url": image_url}},
            ],
        }
    ]

    try:
        response = await asyncio.wait_for(
            client.chat.completions.create(model=settings.doubao_model, messages=messages),
            timeout=settings.image_describe_timeout,
        )
        description = response.choices[0].message.content
        if not description:
            raise ImageDescribeError("豆包返回了空的图片描述")
        return description
    except asyncio.TimeoutError:
        logger.error(f"图片描述超时: image_url={image_url}")
        raise ImageDescribeError("图片识别超时")
    except ImageDescribeError:
        raise
    except Exception as e:
        logger.error(f"图片描述失败: image_url={image_url}, error={e}")
        raise ImageDescribeError(f"图片识别失败: {e}")
