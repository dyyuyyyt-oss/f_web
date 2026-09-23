"""
AI 客户端封装
支持 DeepSeek 和火山引擎方舟（Volcano Engine Ark）
两者都通过 OpenAI 兼容接口调用
"""

import asyncio
from typing import AsyncGenerator, Optional, Literal
from openai import AsyncOpenAI, APIError, APIConnectionError, APITimeoutError
from app.core.config import settings
import logging


logger = logging.getLogger(__name__)


class AIClient:
    """
    统一的 AI 客户端类
    支持多个 OpenAI 兼容的 AI 服务提供商
    """

    def __init__(
        self,
        provider: Literal["deepseek", "volcengine"] = "deepseek",
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        model: Optional[str] = None,
    ):
        """
        初始化 AI 客户端

        Args:
            provider: AI 提供商类型（deepseek 或 volcengine）
            api_key: API Key（如果为 None，从 settings 读取）
            base_url: API 基础 URL（如果为 None，从 settings 读取）
            model: 模型名称（如果为 None，从 settings 读取）
        """
        self.provider = provider

        # 从配置获取信息
        config = self._get_provider_config(provider)

        self.api_key = api_key or config.get("api_key")
        self.base_url = base_url or config.get("base_url")
        self.model = model or config.get("model")

        # 验证必要的配置
        if not self.api_key:
            raise ValueError(f"Missing API key for provider: {provider}")
        if not self.base_url:
            raise ValueError(f"Missing base URL for provider: {provider}")
        if not self.model:
            raise ValueError(f"Missing model for provider: {provider}")

        # 创建 AsyncOpenAI 客户端
        self.client = AsyncOpenAI(
            api_key=self.api_key,
            base_url=self.base_url,
        )

    @staticmethod
    def _get_provider_config(provider: Literal["deepseek", "volcengine"]) -> dict:
        """根据提供商获取配置"""
        if provider == "deepseek":
            return {
                "api_key": settings.deepseek_api_key,
                "base_url": settings.deepseek_base_url,
                "model": settings.deepseek_model,
            }
        elif provider == "volcengine":
            return {
                "api_key": settings.volcengine_api_key,
                "base_url": settings.volcengine_base_url,
                "model": settings.volcengine_model,
            }
        else:
            raise ValueError(f"Unsupported AI provider: {provider}")

    async def stream_chat(
        self,
        messages: list[dict[str, str]],
        temperature: Optional[float] = None,
        top_p: Optional[float] = None,
        max_tokens: Optional[int] = None,
        frequency_penalty: Optional[float] = None,
        presence_penalty: Optional[float] = None,
    ) -> AsyncGenerator[str, None]:
        """
        流式聊天接口
        逐段返回 AI 的回复文本

        Args:
            messages: 消息列表，每条消息格式为 {"role": "user"|"assistant", "content": "..."}
            temperature: 温度参数（0-2），控制回复的随机性；为 None 时用 settings.chat_temperature
            top_p: 核采样阈值；为 None 时用 settings.chat_top_p
            max_tokens: 最大令牌数；为 None 时用 settings.chat_max_tokens
            frequency_penalty: 频率惩罚；为 None 时用 settings.chat_frequency_penalty
            presence_penalty: 存在惩罚；为 None 时用 settings.chat_presence_penalty

        Yields:
            AI 回复的文本段落
        """
        # 未显式传参时，统一从 config 读取可配置的默认值，不再硬编码
        temperature = settings.chat_temperature if temperature is None else temperature
        top_p = settings.chat_top_p if top_p is None else top_p
        max_tokens = settings.chat_max_tokens if max_tokens is None else max_tokens
        frequency_penalty = settings.chat_frequency_penalty if frequency_penalty is None else frequency_penalty
        presence_penalty = settings.chat_presence_penalty if presence_penalty is None else presence_penalty

        try:
            logger.info(
                f"Starting stream chat with provider={self.provider}, model={self.model}"
            )

            # 调用 OpenAI 兼容 API
            stream = await self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                stream=True,
                temperature=temperature,
                top_p=top_p,
                max_tokens=max_tokens,
                frequency_penalty=frequency_penalty,
                presence_penalty=presence_penalty,
            )

            # 异步流式返回每个 chunk
            async for chunk in stream:
                if chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content

        except APIConnectionError as e:
            logger.error(f"Connection error: {e}")
            yield f"[错误] 无法连接到 {self.provider} 服务"
        except APITimeoutError as e:
            logger.error(f"Timeout error: {e}")
            yield "[错误] 请求超时，请重试"
        except APIError as e:
            logger.error(f"API error: {e}")
            yield f"[错误] API 调用失败: {str(e)}"
        except Exception as e:
            logger.error(f"Unexpected error in stream_chat: {e}")
            yield "[错误] 发生未知错误"

    async def chat(
        self,
        messages: list[dict[str, str]],
        temperature: Optional[float] = None,
        top_p: Optional[float] = None,
        max_tokens: Optional[int] = None,
        frequency_penalty: Optional[float] = None,
        presence_penalty: Optional[float] = None,
    ) -> str:
        """
        非流式聊天接口
        一次性返回 AI 的完整回复

        Args:
            messages: 消息列表
            temperature: 温度参数；为 None 时用 settings.chat_temperature
            top_p: 核采样阈值；为 None 时用 settings.chat_top_p
            max_tokens: 最大令牌数；为 None 时用 settings.chat_max_tokens
            frequency_penalty: 频率惩罚；为 None 时用 settings.chat_frequency_penalty
            presence_penalty: 存在惩罚；为 None 时用 settings.chat_presence_penalty

        Returns:
            AI 的完整回复文本
        """
        # 未显式传参时，统一从 config 读取可配置的默认值，不再硬编码
        temperature = settings.chat_temperature if temperature is None else temperature
        top_p = settings.chat_top_p if top_p is None else top_p
        max_tokens = settings.chat_max_tokens if max_tokens is None else max_tokens
        frequency_penalty = settings.chat_frequency_penalty if frequency_penalty is None else frequency_penalty
        presence_penalty = settings.chat_presence_penalty if presence_penalty is None else presence_penalty

        try:
            logger.info(f"Starting chat with provider={self.provider}, model={self.model}")

            response = await self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=temperature,
                top_p=top_p,
                max_tokens=max_tokens,
                frequency_penalty=frequency_penalty,
                presence_penalty=presence_penalty,
            )

            return response.choices[0].message.content or ""

        except APIConnectionError as e:
            logger.error(f"Connection error: {e}")
            return f"[错误] 无法连接到 {self.provider} 服务"
        except APITimeoutError as e:
            logger.error(f"Timeout error: {e}")
            return "[错误] 请求超时，请重试"
        except APIError as e:
            logger.error(f"API error: {e}")
            return f"[错误] API 调用失败: {str(e)}"
        except Exception as e:
            logger.error(f"Unexpected error in chat: {e}")
            return "[错误] 发生未知错误"


def get_ai_client(provider: Optional[str] = None) -> AIClient:
    """
    工厂函数：获取 AI 客户端实例

    Args:
        provider: AI 提供商（如果为 None，使用 settings 中的配置）

    Returns:
        AIClient 实例
    """
    provider = provider or settings.ai_provider
    return AIClient(provider=provider)
