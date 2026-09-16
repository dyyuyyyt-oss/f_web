"""
启动脚本
用于快速启动开发服务器
"""

import os
import sys
import subprocess
from pathlib import Path

# 获取项目根目录
PROJECT_ROOT = Path(__file__).parent


def check_requirements():
    """检查是否安装了依赖"""
    try:
        import fastapi
        import sqlalchemy
        import pydantic
        return True
    except ImportError:
        print("❌ 缺少必要的依赖，请运行: pip install -r requirements.txt")
        return False


def check_env_file():
    """检查 .env 文件是否存在"""
    env_file = PROJECT_ROOT / ".env"
    env_example = PROJECT_ROOT / ".env.example"

    if not env_file.exists():
        if env_example.exists():
            print(f"⚠️  未找到 .env 文件，正在从 .env.example 创建...")
            import shutil
            shutil.copy(env_example, env_file)
            print(f"📄 已创建 .env 文件，请根据需要修改配置")
        else:
            print("❌ 缺少 .env.example 文件")
            return False
    return True


def main():
    """主函数"""
    print("=" * 60)
    print("🚀 AI 角色扮演聊天网站后端 MVP")
    print("=" * 60)

    # 检查依赖
    print("\n📦 检查依赖...")
    if not check_requirements():
        sys.exit(1)
    print("✅ 依赖检查通过")

    # 检查环境变量文件
    print("\n📋 检查配置文件...")
    if not check_env_file():
        sys.exit(1)
    print("✅ 配置文件检查通过")

    # 启动服务
    print("\n🔧 启动服务...")
    print("=" * 60)
    print("📌 API 文档: http://localhost:8000/docs")
    print("📌 健康检查: http://localhost:8000/health")
    print("📌 聊天接口: http://localhost:8000/api/chat/stream")
    print("📌 角色列表: http://localhost:8000/api/characters")
    print("=" * 60)

    os.chdir(PROJECT_ROOT)
    subprocess.run([
        sys.executable,
        "-m",
        "uvicorn",
        "app.main:app",
        "--reload",
        "--host", "0.0.0.0",
        "--port", "8000",
    ])


if __name__ == "__main__":
    main()
