"""
SQLAlchemy 数据库会话管理
提供数据库连接、会话创建、初始化等功能
"""

from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import StaticPool
from typing import Generator
from app.core.config import settings
from app.db.base import Base
import os


# 创建数据库引擎
# 对于 SQLite，enable_query_cache=False 是为了避免在异步环境中的缓存问题
if settings.database_url.startswith("sqlite"):
    # SQLite 配置：使用内存池避免多线程问题
    engine = create_engine(
        settings.database_url,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        echo=settings.sqlalchemy_echo,
    )
else:
    # 其他数据库配置（如 PostgreSQL）
    engine = create_engine(
        settings.database_url,
        echo=settings.sqlalchemy_echo,
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
