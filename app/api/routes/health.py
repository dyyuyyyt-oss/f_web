"""
健康检查路由
用于检测服务是否正常运行，并返回当前配置状态
"""

from fastapi import APIRouter
from sqlalchemy import text
from app.core.config import settings
from app.db.session import SessionLocal

router = APIRouter(tags=["健康检查"])


@router.get("/health", tags=["健康检查"], summary="健康检查", description="返回服务状态、当前 AI 提供商、是否使用模拟模式及数据库连接状态")
def health_check():
    # 注意：这里用同步 def 而非 async def
    # db.execute() 是阻塞调用，若写成 async def 会在数据库连接卡住时
    # 阻塞整个事件循环，导致所有其他请求都无法响应；
    # 同步函数会被 FastAPI 自动放到线程池中执行，避免这个问题
    """
    健康检查端点
    返回服务状态、当前 AI 配置和数据库连接状态

    Returns:
        {
            "status": "ok",
            "ai_provider": "deepseek" | "volcengine",
            "use_mock_ai": true | false,
            "app_name": "AI Chat Backend MVP",
            "app_version": "0.1.0",
            "db": "ok" | "error",
            "db_detail": "..."  # 仅当 db 为 error 时存在
        }
    """
    # 执行一次简单查询验证数据库连接是否可用
    # 数据库异常不应导致 /health 本身返回非 200，只在响应体中体现状态
    db_status: dict = {"db": "ok"}
    db = SessionLocal()
    try:
        db.execute(text("SELECT 1"))
    except Exception as e:
        db_status = {"db": "error", "db_detail": str(e)}
    finally:
        db.close()

    return {
        "status": "ok",
        "ai_provider": settings.ai_provider,
        "use_mock_ai": settings.use_mock_ai,
        "app_name": settings.app_name,
        "app_version": settings.app_version,
        **db_status,
    }


@router.get(
    f"{settings.api_prefix}/health",
    tags=["健康检查"],
    summary="轻量存活检查",
    description="不查数据库，只表示后端进程已经在运行。供前端判断 Render 实例是否已唤醒、外部监控定时保活使用；"
    "需要看数据库状态请用 /health。",
)
def liveness_check():
    return {"ok": True}
