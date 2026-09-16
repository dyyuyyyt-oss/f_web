"""
Windows PowerShell 启动脚本
用于在 Windows 上快速启动开发服务器
"""

Write-Host "=" * 60 -ForegroundColor Cyan
Write-Host "🚀 AI 角色扮演聊天网站后端 MVP" -ForegroundColor Green
Write-Host "=" * 60 -ForegroundColor Cyan

# 检查虚拟环境
Write-Host "`n📦 检查虚拟环境..." -ForegroundColor Yellow
if (-Not (Test-Path "venv\Scripts\Activate.ps1")) {
    Write-Host "⚠️  未找到虚拟环境，正在创建..." -ForegroundColor Yellow
    python -m venv venv
    Write-Host "✅ 虚拟环境创建完成" -ForegroundColor Green
}

# 激活虚拟环境
Write-Host "激活虚拟环境..." -ForegroundColor Yellow
& "venv\Scripts\Activate.ps1"

# 检查依赖
Write-Host "`n📦 检查依赖..." -ForegroundColor Yellow
python -c "import fastapi, sqlalchemy, pydantic" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "安装依赖..." -ForegroundColor Yellow
    pip install -r requirements.txt
    Write-Host "✅ 依赖安装完成" -ForegroundColor Green
} else {
    Write-Host "✅ 依赖已安装" -ForegroundColor Green
}

# 检查 .env 文件
Write-Host "`n📋 检查配置文件..." -ForegroundColor Yellow
if (-Not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "📄 已创建 .env 文件，请根据需要修改配置" -ForegroundColor Green
}

# 启动服务
Write-Host "`n🔧 启动服务..." -ForegroundColor Yellow
Write-Host "=" * 60 -ForegroundColor Cyan
Write-Host "📌 API 文档: http://localhost:8000/docs" -ForegroundColor Cyan
Write-Host "📌 健康检查: http://localhost:8000/health" -ForegroundColor Cyan
Write-Host "📌 聊天接口: http://localhost:8000/api/chat/stream" -ForegroundColor Cyan
Write-Host "📌 角色列表: http://localhost:8000/api/characters" -ForegroundColor Cyan
Write-Host "=" * 60 -ForegroundColor Cyan

uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
