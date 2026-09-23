"""
FastAPI 应用主入口
"""

from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.core.config import settings
from app.db.session import init_db, close_db
from app.models import Character, User, Conversation, Message
from app.db.session import SessionLocal
from app.api.routes import health, chat, characters, auth, admin, image, upload
from app.core.security import hash_password
import logging
from datetime import datetime

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


# 生命周期事件处理
@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    应用生命周期事件
    startup: 应用启动时执行
    shutdown: 应用关闭时执行
    """
    # ==================== Startup 事件 ====================
    logger.info("=" * 50)
    logger.info(f"🚀 启动 {settings.app_name} v{settings.app_version}")
    logger.info("=" * 50)

    # 初始化数据库
    # 用 try/except 包裹，避免数据库连接失败（如 Render 上 PostgreSQL 尚未就绪）导致应用启动崩溃
    try:
        init_db()
        logger.info("✅ 数据库初始化完成")
    except Exception as e:
        logger.error(f"⚠️ 数据库初始化失败: {e}")

    # 插入示例数据
    _insert_sample_data()
    logger.info("✅ 示例数据插入完成")

    # 插入预置账号（普通用户 confur、管理员 con）
    _insert_preset_accounts()
    logger.info("✅ 预置账号检查完成")

    # 打印当前配置
    logger.info(f"📋 当前配置:")
    logger.info(f"   - AI 提供商: {settings.ai_provider}")
    logger.info(f"   - 使用模拟 AI: {settings.use_mock_ai}")
    logger.info(f"   - 数据库: {settings.database_url}")
    logger.info(f"   - CORS 源: {settings.cors_origins}")
    logger.info("=" * 50)

    yield

    # ==================== Shutdown 事件 ====================
    logger.info("🛑 应用关闭中...")
    close_db()
    logger.info("✅ 数据库连接已关闭")


# 创建 FastAPI 应用
app = FastAPI(
    title="AI 角色扮演聊天后端",
    description="类似星野 App 的 AI 角色扮演聊天后端 API，支持 DeepSeek 和火山引擎方舟。",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_tags=[
        {"name": "健康检查", "description": "服务健康状态相关接口"},
        {"name": "聊天", "description": "AI 对话相关接口，支持流式输出"},
        {"name": "角色", "description": "角色卡管理相关接口"},
        {"name": "认证", "description": "登录、注册申请相关接口"},
        {"name": "管理后台", "description": "账号管理与注册审核相关接口，仅管理员可访问"},
        {"name": "图片识别", "description": "图片内容描述相关接口"},
        {"name": "文件上传", "description": "通用文件上传相关接口"},
    ],
    lifespan=lifespan,
)


# ==================== CORS 中间件 ====================
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=settings.cors_allow_credentials,
    allow_methods=settings.cors_allow_methods,
    allow_headers=settings.cors_allow_headers,
)


# ==================== 路由注册 ====================
# 不需要 API 前缀的路由
app.include_router(health.router)

# 需要 API 前缀的路由
app.include_router(chat.router, prefix=settings.api_prefix)
app.include_router(characters.router, prefix=settings.api_prefix)
app.include_router(auth.router, prefix=settings.api_prefix)
app.include_router(admin.router, prefix=settings.api_prefix)
app.include_router(image.router, prefix=settings.api_prefix)
app.include_router(upload.router, prefix=settings.api_prefix)


# ==================== 静态文件（头像、聊天图片等上传文件）====================
# StaticFiles 挂载时目录必须已存在，因此提前创建（同时会创建父目录 uploads/）
Path("uploads/avatars").mkdir(parents=True, exist_ok=True)
app.mount(f"{settings.api_prefix}/uploads", StaticFiles(directory="uploads"), name="uploads")
# 聊天图片直接存在 uploads/ 根目录下，额外挂载一个不带 /api 前缀的路径方便访问
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads_root")


# ==================== 根路由 ====================
@app.get("/", tags=["健康检查"], summary="服务首页", description="返回 API 服务基本信息和文档入口地址")
async def root():
    """根路由"""
    return {
        "message": f"欢迎使用 {settings.app_name}",
        "version": settings.app_version,
        "docs": "/docs",
        "openapi": "/openapi.json",
    }


# ==================== 辅助函数 ====================
def _insert_sample_data() -> None:
    """
    插入示例数据到数据库
    包括示例用户、角色等
    """
    db = SessionLocal()

    try:
        # 检查是否已存在示例数据
        existing_user = db.query(User).filter_by(username="demo_user").first()
        if existing_user:
            logger.info("示例数据已存在，跳过插入")
            return

        # 创建示例用户
        demo_user = User(
            username="demo_user",
            email="demo@example.com",
        )
        db.add(demo_user)
        db.commit()
        db.refresh(demo_user)
        logger.info(f"✨ 创建示例用户: {demo_user.username}")

        # 创建示例角色
        sample_character = Character(
            name="星野🌟",
            avatar="https://via.placeholder.com/256",
            persona="我是一个慵懒而神秘的 AI 角色，喜欢用轻松幽默的方式与你交流。我有着对世界的热情，也对小细节很感兴趣。",
            greeting="嘿~你来了啊，很高兴见到你呢 ✨",
            scenario="我们在一个舒适的咖啡馆里，窗外是淅沥的雨声。",
            example_dialogue="用户：你好！\n我：嘿~你来了啊，很高兴见到你呢 ✨\n\n用户：最近怎么样？\n我：哎呀，最近有点懒散呢，在窗边看了整个下午的雨 ☔ 你呢？",
        )
        db.add(sample_character)
        db.commit()
        db.refresh(sample_character)
        logger.info(f"✨ 创建示例角色: {sample_character.name}")

        # 创建示例对话记录
        conversation = Conversation(
            user_id=demo_user.id,
            character_id=sample_character.id,
            title="初次见面",
        )
        db.add(conversation)
        db.commit()
        db.refresh(conversation)
        logger.info(f"✨ 创建示例对话: {conversation.title}")

        # 创建示例消息
        sample_messages = [
            Message(
                conversation_id=conversation.id,
                role="user",
                content="你好！",
            ),
            Message(
                conversation_id=conversation.id,
                role="assistant",
                content="嘿~你来了啊，很高兴见到你呢 ✨",
            ),
        ]
        db.add_all(sample_messages)
        db.commit()
        logger.info(f"✨ 创建示例消息 {len(sample_messages)} 条")

    except Exception as e:
        logger.error(f"插入示例数据失败: {e}")
        db.rollback()
    finally:
        db.close()


def _insert_preset_accounts() -> None:
    """
    插入预置账号：普通用户 confur 和管理员 con
    密码统一哈希存储，幂等（已存在则跳过）
    """
    db = SessionLocal()

    try:
        preset_accounts = [
            {"username": "confur", "password": "1101062011Zz", "role": "user"},
            {"username": "con", "password": "1101062011Zz", "role": "admin"},
        ]

        for account in preset_accounts:
            existing = db.query(User).filter_by(username=account["username"]).first()
            if existing:
                continue

            new_user = User(
                username=account["username"],
                password_hash=hash_password(account["password"]),
                role=account["role"],
            )
            db.add(new_user)
            db.commit()
            db.refresh(new_user)
            logger.info(f"✨ 创建预置账号: {new_user.username}（{new_user.role}）")

    except Exception as e:
        logger.error(f"插入预置账号失败: {e}")
        db.rollback()
    finally:
        db.close()


if __name__ == "__main__":
    import uvicorn

    # 运行命令: uvicorn app.main:app --reload
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
    )
