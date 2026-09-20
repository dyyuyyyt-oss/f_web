"""
SQLAlchemy 数据库会话管理
提供数据库连接、会话创建、初始化等功能
"""

from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import StaticPool
from typing import Generator
from app.core.config import settings
from app.db.base import Base
import os


# 规范化数据库连接串：
# Render 等平台提供的 DATABASE_URL 通常是 postgres:// 或不带驱动名的 postgresql://
# SQLAlchemy 2.x 不再接受 postgres:// 前缀，且裸 postgresql:// 默认会尝试加载 psycopg2；
# 本项目安装的是 psycopg（v3），因此需要显式改写为 postgresql+psycopg:// 才能生效
db_url = settings.database_url
if db_url.startswith("postgres://"):
    db_url = db_url.replace("postgres://", "postgresql+psycopg://", 1)
elif db_url.startswith("postgresql://"):
    db_url = db_url.replace("postgresql://", "postgresql+psycopg://", 1)

# 创建数据库引擎
# 对于 SQLite，enable_query_cache=False 是为了避免在异步环境中的缓存问题
if settings.database_url.startswith("sqlite"):
    # SQLite 配置：使用内存池避免多线程问题
    engine = create_engine(
        db_url,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        echo=settings.sqlalchemy_echo,
    )
else:
    # 其他数据库配置（如 PostgreSQL）
    # pool_pre_ping: 每次取连接前先 ping，避免使用已被服务端关闭的失效连接
    # pool_recycle: 每 300 秒（5 分钟）主动回收连接，避免被数据库或网络中间层强制断开
    # pool_size / max_overflow: 控制连接池大小，防止连接数超出数据库限制
    # connect_args.connect_timeout: 单次连接尝试最多等待 10 秒，
    #   避免数据库不可达时长时间卡住（曾实测在无超时限制的情况下卡住超过 2 分钟）
    engine = create_engine(
        db_url,
        echo=settings.sqlalchemy_echo,
        pool_pre_ping=True,
        pool_recycle=300,
        pool_size=5,
        max_overflow=10,
        connect_args={"connect_timeout": 10},
    )


# 创建会话工厂
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
    expire_on_commit=False,  # 防止在某些场景下的 DetachedInstanceError
)


def init_db() -> None:
    """
    初始化数据库：创建所有表
    在应用启动时调用
    """
    Base.metadata.create_all(bind=engine)
    _ensure_user_auth_columns()


def _ensure_user_auth_columns() -> None:
    """
    给已存在的 user 表补上账号系统需要的新列（password_hash、role）

    create_all() 只会创建缺失的表，不会给已存在的表加列；线上（如 Render Postgres）
    的 user 表在加账号系统之前就已经建好并有数据了，所以这里用 inspect() 检查实际列，
    缺什么就补什么，全程幂等（多次启动不会重复执行），避免引入 Alembic 迁移脚本。
    """
    inspector = inspect(engine)
    if "user" not in inspector.get_table_names():
        return  # create_all 应该已经建好表，这里只是防御性检查

    existing_columns = {col["name"] for col in inspector.get_columns("user")}
    with engine.begin() as conn:
        if "password_hash" not in existing_columns:
            conn.execute(text('ALTER TABLE "user" ADD COLUMN password_hash VARCHAR(255)'))
        if "role" not in existing_columns:
            conn.execute(
                text('ALTER TABLE "user" ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT \'user\'')
            )


def get_db() -> Generator[Session, None, None]:
    """
    获取数据库会话依赖
    用于 FastAPI 依赖注入
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def close_db() -> None:
    """关闭所有数据库连接"""
    engine.dispose()
