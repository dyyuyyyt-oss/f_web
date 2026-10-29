"""
SQLAlchemy 数据库会话管理
提供数据库连接、会话创建、初始化等功能
"""

import logging
import re
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
    _ensure_message_image_columns()
    _ensure_character_persona_columns()
    _ensure_group_chat_columns()


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


def _ensure_message_image_columns() -> None:
    """
    给已存在的 message 表补上图片消息需要的新列（image_url、image_description）
    原理同 _ensure_user_auth_columns()，全程幂等
    """
    inspector = inspect(engine)
    if "message" not in inspector.get_table_names():
        return

    existing_columns = {col["name"] for col in inspector.get_columns("message")}
    with engine.begin() as conn:
        if "image_url" not in existing_columns:
            conn.execute(text("ALTER TABLE message ADD COLUMN image_url VARCHAR(500)"))
        if "image_description" not in existing_columns:
            conn.execute(text("ALTER TABLE message ADD COLUMN image_description TEXT"))


def _ensure_character_persona_columns() -> None:
    """
    给已存在的 character 表补上说话风格/口头禅需要的新列（speaking_style、catchphrase）
    原理同 _ensure_user_auth_columns()，全程幂等
    """
    inspector = inspect(engine)
    if "character" not in inspector.get_table_names():
        return

    existing_columns = {col["name"] for col in inspector.get_columns("character")}
    with engine.begin() as conn:
        if "speaking_style" not in existing_columns:
            conn.execute(text("ALTER TABLE character ADD COLUMN speaking_style TEXT"))
        if "catchphrase" not in existing_columns:
            conn.execute(text("ALTER TABLE character ADD COLUMN catchphrase TEXT"))


def _ensure_group_chat_columns() -> None:
    """
    群聊需要改动的已有表（全程幂等，多次启动不会重复执行）：
    - conversation 加 group_id 列 + 索引；message 加 speaker_id 列
    - conversation.character_id 放开非空约束（群聊会话没有单个角色）

    补列沿用上面几个函数的做法：先 inspect() 查实际有哪些列，缺什么补什么。
    不用 "try ADD COLUMN / except 跳过" 的写法：PostgreSQL 里同一个事务中一条语句失败，
    整个事务会进入 aborted 状态，后面的语句全部失败。
    新加的列在已有库上不带数据库层面的外键约束，引用关系由应用代码维护（删除角色 / 用户时同步清理）。
    """
    inspector = inspect(engine)
    tables = inspector.get_table_names()

    if "conversation" in tables:
        columns = {col["name"]: col for col in inspector.get_columns("conversation")}
        if "group_id" not in columns:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE conversation ADD COLUMN group_id INTEGER"))
        if not columns["character_id"]["nullable"]:
            _make_conversation_character_nullable()
        index_names = {ix["name"] for ix in inspect(engine).get_indexes("conversation")}
        if "ix_conversation_group_id" not in index_names:
            with engine.begin() as conn:
                conn.execute(text("CREATE INDEX ix_conversation_group_id ON conversation (group_id)"))

    if "message" in tables:
        columns = {col["name"] for col in inspector.get_columns("message")}
        if "speaker_id" not in columns:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE message ADD COLUMN speaker_id INTEGER"))


def _make_conversation_character_nullable() -> None:
    """把 conversation.character_id 改成可空"""
    if engine.dialect.name == "sqlite":
        _sqlite_rebuild_table_dropping_not_null("conversation", "character_id")
    else:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE conversation ALTER COLUMN character_id DROP NOT NULL"))
    logging.getLogger(__name__).info("✅ conversation.character_id 已改为可空（群聊会话需要）")


def _sqlite_rebuild_table_dropping_not_null(table: str, column: str) -> None:
    """
    SQLite 不支持修改列约束，按官方推荐的步骤重建表：
    建新表（去掉该列的 NOT NULL）→ 拷贝全部数据 → 删旧表 → 新表改名 → 重建原有索引。
    整个过程在一个显式事务里完成，任何一步失败都整体回滚，原表和数据保持不变。
    """
    tmp = f"{table}__rebuild"
    raw = engine.raw_connection()
    try:
        dbapi_conn = raw.driver_connection
        old_isolation = dbapi_conn.isolation_level
        dbapi_conn.isolation_level = None  # 自己控制 BEGIN / COMMIT，DDL 和数据拷贝都在同一个事务里
        cur = dbapi_conn.cursor()
        foreign_keys_on = cur.execute("PRAGMA foreign_keys").fetchone()[0] == 1
        if foreign_keys_on:
            cur.execute("PRAGMA foreign_keys=OFF")  # 删旧表时不能触发外键检查；只能在事务外设置
        try:
            cur.execute("BEGIN")
            create_sql = cur.execute(
                "SELECT sql FROM sqlite_master WHERE type='table' AND name=?", (table,)
            ).fetchone()[0]
            index_sqls = [
                row[0]
                for row in cur.execute(
                    "SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name=? AND sql IS NOT NULL", (table,)
                )
            ]
            new_sql, replaced = re.subn(
                rf"(\b{column}\s+INTEGER)\s+NOT\s+NULL", r"\1", create_sql, count=1, flags=re.IGNORECASE
            )
            if replaced != 1:
                raise RuntimeError(f"没有在建表语句里找到 {column} INTEGER NOT NULL：{create_sql}")
            new_sql = re.sub(rf'^CREATE TABLE\s+"?{table}"?', f'CREATE TABLE "{tmp}"', new_sql, count=1, flags=re.IGNORECASE)

            cur.execute(f'DROP TABLE IF EXISTS "{tmp}"')
            cur.execute(new_sql)
            column_names = [row[1] for row in cur.execute(f'PRAGMA table_info("{table}")')]
            column_list = ", ".join(f'"{name}"' for name in column_names)
            cur.execute(f'INSERT INTO "{tmp}" ({column_list}) SELECT {column_list} FROM "{table}"')
            before = cur.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0]
            after = cur.execute(f'SELECT COUNT(*) FROM "{tmp}"').fetchone()[0]
            if before != after:
                raise RuntimeError(f"重建 {table} 时行数不一致：{before} → {after}")
            cur.execute(f'DROP TABLE "{table}"')
            cur.execute(f'ALTER TABLE "{tmp}" RENAME TO "{table}"')
            for sql in index_sqls:
                cur.execute(sql)
            cur.execute("COMMIT")
        except Exception:
            cur.execute("ROLLBACK")
            raise
        finally:
            if foreign_keys_on:
                cur.execute("PRAGMA foreign_keys=ON")
            dbapi_conn.isolation_level = old_isolation
    finally:
        raw.close()


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
