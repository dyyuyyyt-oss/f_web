#!/bin/bash

# macOS / Linux 启动脚本
# 用于快速启动开发服务器

echo "============================================================"
echo "🚀 AI 角色扮演聊天网站后端 MVP"
echo "============================================================"

# 检查虚拟环境
echo ""
echo "📦 检查虚拟环境..."
if [ ! -d "venv" ]; then
    echo "⚠️  未找到虚拟环境，正在创建..."
    python3 -m venv venv
    echo "✅ 虚拟环境创建完成"
fi

# 激活虚拟环境
echo "激活虚拟环境..."
source venv/bin/activate

# 检查依赖
echo ""
echo "📦 检查依赖..."
python -c "import fastapi, sqlalchemy, pydantic" 2>/dev/null
if [ $? -ne 0 ]; then
    echo "安装依赖..."
    pip install -r requirements.txt
    echo "✅ 依赖安装完成"
else
    echo "✅ 依赖已安装"
fi

# 检查 .env 文件
echo ""
echo "📋 检查配置文件..."
if [ ! -f ".env" ]; then
    cp .env.example .env
    echo "📄 已创建 .env 文件，请根据需要修改配置"
fi

# 启动服务
echo ""
echo "🔧 启动服务..."
echo "============================================================"
echo "📌 API 文档: http://localhost:8000/docs"
echo "📌 健康检查: http://localhost:8000/health"
echo "📌 聊天接口: http://localhost:8000/api/chat/stream"
echo "📌 角色列表: http://localhost:8000/api/characters"
echo "============================================================"

uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
