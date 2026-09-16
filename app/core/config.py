"""
项目全局配置
读取环境变量并提供类型安全的配置对象
"""

from pathlib import Path
from pydantic_settings import BaseSettings
from typing import Optional, Literal


class Settings(BaseSettings):
    """应用配置类"""

    # ==================== 基础配置 ====================
    app_name: str = "AI Chat Backend MVP"
    app_version: str = "0.1.0"
    debug: bool = False

    # ==================== 数据库配置 ====================
    # SQLite 数据库文件路径
    database_url: str = "sqlite:///./ai_chat.db"
    sqlalchemy_echo: bool = False

    # ==================== AI 提供商配置 ====================
    # 当前选中的 AI 提供商: deepseek 或 volcengine
    ai_provider: Literal["deepseek", "volcengine"] = "deepseek"

    # 是否使用模拟 AI 流（不调用真实 API）
    use_mock_ai: bool = True

    # -------- DeepSeek 配置 --------
    deepseek_api_key: Optional[str] = None
    deepseek_base_url: str = "https://api.deepseek.com/v1"
    deepseek_model: str = "deepseek-chat"

    # -------- 火山引擎方舟（Volcano Engine Ark）配置 --------
    volcengine_api_key: Optional[str] = None
    volcengine_base_url: str = "https://ark.cn-beijing.volces.com/api/v3"
    volcengine_model: Optional[str] = None  # 推理接入点 ID 或模型 ID

    # ==================== CORS 配置 ====================
    cors_origins: list[str] = ["http://localhost:3000", "http://localhost:5173"]
    cors_allow_credentials: bool = True
    cors_allow_methods: list[str] = ["*"]
    cors_allow_headers: list[str] = ["*"]

    # ==================== API 路由前缀 ====================
    api_prefix: str = "/api"

    # ==================== 流式响应缓冲 ====================
    stream_buffer_size: int = 10  # 单位：字符数

    class Config:
        """Pydantic 配置"""
        env_file = ".env"
        case_sensitive = False
        # 当环境变量为 "true" 或 "1" 时，布尔值转换为 True
        # 当为 "false" 或 "0" 时，转换为 False
        str_to_lower = False

    def get_current_ai_config(self) -> dict:
        """
        根据当前 AI_PROVIDER 环境变量返回对应的配置字典
        返回格式: {
            "api_key": "xxx",
            "base_url": "xxx",
            "model": "xxx"
        }
        """
        if self.ai_provider == "deepseek":
            return {
                "api_key": self.deepseek_api_key,
                "base_url": self.deepseek_base_url,
                "model": self.deepseek_model,
            }
        elif self.ai_provider == "volcengine":
            return {
                "api_key": self.volcengine_api_key,
                "base_url": self.volcengine_base_url,
                "model": self.volcengine_model,
            }
        else:
            raise ValueError(f"Unsupported AI provider: {self.ai_provider}")

    def validate_ai_config(self) -> None:
        """
        验证当前 AI 提供商的配置是否有效
        如果 use_mock_ai=False，则需要确保 API Key 已配置
        """
        if self.use_mock_ai:
            return  # 模拟模式不需要验证

        config = self.get_current_ai_config()
        if not config.get("api_key"):
            raise ValueError(
                f"AI provider '{self.ai_provider}' requires API key to be configured"
            )


# 全局配置实例
settings = Settings()
