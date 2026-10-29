"""
项目全局配置
读取环境变量并提供类型安全的配置对象
"""

from pathlib import Path
from pydantic import field_validator
from pydantic_settings import BaseSettings
from typing import Optional, Literal

# JWT 签名密钥的开发默认值：仓库公开，任何人都能看到它，生产环境必须用 SECRET_KEY 覆盖
DEFAULT_SECRET_KEY = "dev-only-insecure-secret-change-me"


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

    # -------- 豆包（图片理解）配置，通过火山引擎方舟调用 --------
    doubao_api_key: Optional[str] = None  # 可与 volcengine_api_key 相同
    doubao_base_url: str = "https://ark.cn-beijing.volces.com/api/v3"
    doubao_model: Optional[str] = None  # 推理接入点 ID
    image_describe_timeout: int = 60  # 图片描述单次请求超时时间（秒），可通过环境变量 IMAGE_DESCRIBE_TIMEOUT 覆盖

    # ==================== CORS 配置 ====================
    cors_origins: list[str] = ["http://localhost:3000", "http://localhost:5173"]
    cors_allow_credentials: bool = True
    cors_allow_methods: list[str] = ["*"]
    cors_allow_headers: list[str] = ["*"]

    # ==================== API 路由前缀 ====================
    api_prefix: str = "/api"

    # ==================== 认证配置 ====================
    # 用于签发/校验登录 JWT 的密钥；生产环境必须通过环境变量 SECRET_KEY 覆盖这个开发默认值
    secret_key: str = DEFAULT_SECRET_KEY
    access_token_expire_minutes: int = 60 * 24 * 7  # 登录 token 有效期：7 天

    # ==================== 预置账号 ====================
    # 启动时如果账号不存在就自动创建（已存在则跳过，不会覆盖改过的密码）。
    # 密码只从环境变量读取，不再写死在代码里（仓库是公开的）；不设置就不创建对应账号。
    preset_user_password: Optional[str] = None  # 普通用户 confur 的初始密码，环境变量 PRESET_USER_PASSWORD
    preset_admin_password: Optional[str] = None  # 管理员 con 的初始密码，环境变量 PRESET_ADMIN_PASSWORD

    @field_validator("secret_key", mode="before")
    @classmethod
    def _empty_secret_key_falls_back(cls, value):
        # .env.example 里 SECRET_KEY= 留空，直接复制成 .env 时会得到空字符串，
        # 空密钥签发的 JWT 等于没签名，这里回退到开发默认值（启动时会打告警日志）
        return value or DEFAULT_SECRET_KEY

    # ==================== 流式响应缓冲 ====================
    stream_buffer_size: int = 10  # 单位：字符数

    # ==================== 对话模型参数 ====================
    # 默认值偏高，是为了让角色扮演的回复更有多样性、更少重复用语；均可通过环境变量覆盖
    chat_temperature: float = 0.9  # 温度：越高回复越有随机性/创造力
    chat_top_p: float = 0.95  # 核采样阈值
    chat_max_tokens: int = 1024  # 单次回复最大 token 数，避免长回复被截断
    chat_frequency_penalty: float = 0.3  # 频率惩罚：越高越不容易重复用词
    chat_presence_penalty: float = 0.3  # 存在惩罚：越高越倾向引入新话题/新表达

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
