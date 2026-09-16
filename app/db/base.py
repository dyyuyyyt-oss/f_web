"""
SQLAlchemy 数据库基础配置
"""

from sqlalchemy.orm import DeclarativeBase, declared_attr
from datetime import datetime


class Base(DeclarativeBase):
    """所有 ORM 模型的基类"""

    @declared_attr
    def __tablename__(cls) -> str:
        """自动生成表名：CamelCase -> snake_case"""
        name = cls.__name__
        # 将驼峰命名转换为蛇形命名
        result = []
        for i, char in enumerate(name):
            if i > 0 and char.isupper():
                result.append("_")
                result.append(char.lower())
            else:
                result.append(char.lower())
        return "".join(result)
