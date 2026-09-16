"""
单元测试示例
"""

import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.db.session import SessionLocal, init_db

# 创建测试客户端
client = TestClient(app)


@pytest.fixture(scope="session", autouse=True)
def setup_db():
    """初始化测试数据库"""
    init_db()


def test_health_check():
    """测试健康检查接口"""
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert "ai_provider" in response.json()
    assert "use_mock_ai" in response.json()


def test_list_characters():
    """测试获取角色列表"""
    response = client.get("/api/characters")
    assert response.status_code == 200
    assert isinstance(response.json(), list)
    assert len(response.json()) > 0  # 应该有示例角色


def test_get_character():
    """测试获取单个角色"""
    response = client.get("/api/characters/1")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == 1
    assert "name" in data
    assert "persona" in data


def test_root():
    """测试根路由"""
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert "message" in data
    assert "version" in data


# TODO: 添加更多测试
# - 聊天接口测试
# - 创建角色测试
# - 数据库操作测试
# - 错误处理测试
