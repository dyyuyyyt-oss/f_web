"""
健康检查路由
用于检测服务是否正常运行，并返回当前配置状态
"""

from fastapi import APIRouter
from app.core.config import settings

router = APIRouter(tags=["健康检查"])


@router.get("/health", tags=["健康检查"], summary="健康检查", description="返回服务状态、当前 AI 提供商和是否使用模拟模式")
async def health_check():
    """
    健康检查端点
    返回服务状态和当前 AI 配置

    Returns:
        {
            "status": "ok",
            "ai_provider": "deepseek" | "volcengine",
            "use_mock_ai": true | false,
            "app_name": "AI Chat Backend MVP",
            "app_version": "0.1.0"
        }
    """
    return {
        "status": "ok",
        "ai_provider": settings.ai_provider,
        "use_mock_ai": settings.use_mock_ai,
        "app_name": settings.app_name,
        "app_version": settings.app_version,
    }
