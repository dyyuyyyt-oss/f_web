# 🎭 AI 角色扮演聊天网站后端 MVP

这是一个现代化的 Python FastAPI 后端，用于构建"AI 角色扮演聊天"应用（类似星野 App）。

## ✨ 项目特点

- ✅ **多 AI 提供商支持**: 支持 DeepSeek 和火山引擎方舟（Volcano Engine Ark）
- ✅ **SSE 流式响应**: 实时流式输出 AI 的回复内容
- ✅ **模拟模式**: 可切换为模拟 AI，无需消耗 API 额度
- ✅ **完整的数据模型**: User、Character、Conversation、Message
- ✅ **健康检查**: 一键验证服务状态和配置
- ✅ **CORS 跨域支持**: 支持前端调用，可配置源列表
- ✅ **环境变量配置**: 所有敏感信息从环境变量读取，不硬编码
- ✅ **示例数据**: 启动时自动创建示例角色和对话记录

## 📋 技术栈

| 组件 | 版本 | 说明 |
|------|------|------|
| Python | 3.11+ | 编程语言 |
| FastAPI | 0.104+ | Web 框架 |
| SQLAlchemy | 2.0+ | ORM 框架 |
| Pydantic | 2.5+ | 数据验证 |
| OpenAI SDK | 1.6+ | AI API 客户端 |
| sse-starlette | 2.0+ | SSE 流式响应 |
| SQLite | - | 数据库（开发环境） |

## 🚀 快速开始

### 1️⃣ 克隆或进入项目目录

```bash
cd ai-chat-backend
```

### 2️⃣ 创建虚拟环境

#### 使用 venv（推荐）

```bash
# Windows
python -m venv venv
venv\Scripts\activate

# macOS / Linux
python3 -m venv venv
source venv/bin/activate
```

#### 使用 Conda

```bash
conda create -n ai-chat python=3.11
conda activate ai-chat
```

### 3️⃣ 安装依赖

```bash
pip install -r requirements.txt
```

### 4️⃣ 配置环境变量

从示例文件创建 `.env`：

```bash
# Windows
copy .env.example .env

# macOS / Linux
cp .env.example .env
```

编辑 `.env` 文件，填入你的配置。默认配置使用模拟 AI，无需 API Key：

```env
AI_PROVIDER=deepseek
USE_MOCK_AI=true
```

### 5️⃣ 启动服务

```bash
uvicorn app.main:app --reload
```

服务将在 `http://localhost:8000` 启动

## 📚 API 文档

启动后，访问以下 URL：

- **Swagger API 文档**: http://localhost:8000/docs
- **ReDoc API 文档**: http://localhost:8000/redoc
- **OpenAPI Schema**: http://localhost:8000/openapi.json

## 🔌 API 接口

### 1. 健康检查

```bash
# 检查服务状态
curl http://localhost:8000/health
```

响应示例：

```json
{
  "status": "ok",
  "ai_provider": "deepseek",
  "use_mock_ai": true,
  "app_name": "AI Chat Backend MVP",
  "app_version": "0.1.0"
}
```

### 2. 获取角色列表

```bash
curl http://localhost:8000/api/characters
```

响应示例：

```json
[
  {
    "id": 1,
    "name": "星野🌟",
    "avatar": "https://via.placeholder.com/256",
    "persona": "我是一个慵懒而神秘的 AI 角色...",
    "greeting": "嘿~你来了啊，很高兴见到你呢 ✨",
    "scenario": "我们在一个舒适的咖啡馆里...",
    "example_dialogue": "...",
    "created_at": "2024-01-01T00:00:00"
  }
]
```

### 3. 流式聊天（SSE）

```bash
curl "http://localhost:8000/api/chat/stream?message=你好&character_id=1"
```

这个接口以 SSE（Server-Sent Events）格式返回流式数据，可实时显示 AI 的回复。

**在浏览器或 JavaScript 中使用：**

```javascript
const eventSource = new EventSource(
  "http://localhost:8000/api/chat/stream?message=你好&character_id=1"
);

eventSource.addEventListener("message", (event) => {
  console.log("回复内容:", event.data);
  // 实时显示 AI 的回复
});

eventSource.addEventListener("done", (event) => {
  console.log("对话完成");
  eventSource.close();
});

eventSource.addEventListener("error", (event) => {
  console.error("错误:", event.data);
  eventSource.close();
});
```

### 4. 获取单个角色信息

```bash
curl http://localhost:8000/api/characters/1
```

### 5. 创建新角色

```bash
curl -X POST http://localhost:8000/api/characters \
  -H "Content-Type: application/json" \
  -d '{
    "name": "新角色",
    "persona": "新角色的人设",
    "greeting": "哈喽~"
  }'
```

## 🤖 AI 提供商配置

### 🎯 DeepSeek（默认）

1. **获取 API Key**
   - 访问 https://platform.deepseek.com/api_keys
   - 创建新的 API Key

2. **配置 .env**
   ```env
   AI_PROVIDER=deepseek
   USE_MOCK_AI=false
   DEEPSEEK_API_KEY=sk-xxxxx
   DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
   DEEPSEEK_MODEL=deepseek-chat
   ```

3. **价格**
   - 输入token: $0.14/百万
   - 输出token: $0.28/百万
   - [查看最新价格](https://deepseek.com/)

### 🌋 火山引擎方舟（Volcano Engine Ark）

1. **获取 API Key**
   - 访问 https://console.volcengine.com/ark
   - 创建 API Key
   - 创建推理接入点或模型端点

2. **配置 .env**
   ```env
   AI_PROVIDER=volcengine
   USE_MOCK_AI=false
   VOLCENGINE_API_KEY=your-ark-api-key
   VOLCENGINE_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
   VOLCENGINE_MODEL=ep-xxxxxxxx  # 推理接入点 ID
   ```

3. **获取推理接入点 ID**
   - 登录火山引擎方舟控制台
   - 在「推理接入点」中创建新的接入点
   - 接入点 ID 格式: `ep-xxxxxxxxxxxxxxxx`

4. **切换提供商**
   ```bash
   # 修改 .env 文件的 AI_PROVIDER 值
   AI_PROVIDER=volcengine
   ```

## 📁 项目结构

```
ai-chat-backend/
├── app/
│   ├── __init__.py
│   ├── main.py                    # FastAPI 应用入口
│   ├── core/
│   │   ├── __init__.py
│   │   └── config.py              # 全局配置（从环境变量读取）
│   ├── api/
│   │   ├── __init__.py
│   │   └── routes/
│   │       ├── __init__.py
│   │       ├── health.py          # 健康检查端点
│   │       ├── chat.py            # 聊天接口（SSE 流式）
│   │       └── characters.py      # 角色管理接口
│   ├── db/
│   │   ├── __init__.py
│   │   ├── base.py                # SQLAlchemy Base 类
│   │   └── session.py             # 数据库会话管理
│   ├── models/
│   │   ├── __init__.py
│   │   ├── user.py                # User 模型
│   │   ├── character.py           # Character 模型
│   │   ├── conversation.py        # Conversation 模型
│   │   └── message.py             # Message 模型
│   ├── schemas/
│   │   ├── __init__.py
│   │   ├── chat.py                # 聊天相关的 Pydantic Schema
│   │   └── character.py           # 角色相关的 Pydantic Schema
│   ├── services/
│   │   ├── __init__.py
│   │   ├── ai_client.py           # AI 客户端封装（DeepSeek、火山引擎）
│   │   └── chat_service.py        # 聊天业务逻辑
│   ├── prompts/
│   │   ├── __init__.py
│   │   └── character_prompt.py    # AI 提示词模板
│   └── utils/
│       ├── __init__.py
│       └── streaming.py           # SSE 流式响应工具
├── tests/
│   └── __init__.py
├── .env.example                   # 环境变量示例
├── .gitignore                     # Git 忽略文件
├── requirements.txt               # Python 依赖列表
└── README.md                      # 项目文档
```

## 🔧 开发指南

### 添加新的 AI 提供商

在 `app/services/ai_client.py` 中修改 `AIClient` 类：

```python
# 1. 在 _get_provider_config 方法中添加新提供商的配置
if provider == "new_provider":
    return {
        "api_key": settings.new_provider_api_key,
        "base_url": settings.new_provider_base_url,
        "model": settings.new_provider_model,
    }

# 2. 在 config.py 中添加对应的环境变量
new_provider_api_key: Optional[str] = None
new_provider_base_url: str = "https://..."
new_provider_model: str = "..."
```

### 切换模拟/真实 API

修改 `.env` 中的 `USE_MOCK_AI` 变量：

```env
USE_MOCK_AI=true   # 使用模拟 AI（无需 API Key）
USE_MOCK_AI=false  # 使用真实 API（需要配置 API Key）
```

### 运行测试

```bash
pytest tests/
```

## 📝 TODO

这是 MVP 阶段，以下功能已在计划中：

- [ ] 用户认证与授权（JWT）
- [ ] 用户登录/注册
- [ ] 用户头像上传
- [ ] 对话历史管理
- [ ] 角色编辑与删除
- [ ] 角色市场（用户可发布自己的角色）
- [ ] 支付集成（购买付费角色）
- [ ] 语音识别与合成
- [ ] 消息推荐与搜索
- [ ] 数据库迁移脚本（Alembic）
- [ ] Docker 容器化
- [ ] 生产环境部署指南
- [ ] WebSocket 长连接（实时同步）
- [ ] 内容审核

## ⚠️ 注意事项

### 开发环境

- 当前使用 SQLite 数据库（`ai_chat.db`）
- 生产环境建议迁移到 PostgreSQL
- 默认使用模拟 AI，无需 API Key

### 生产环境

- **不要把 API Key 写进代码**，必须使用环境变量
- 使用强大的数据库（PostgreSQL、MySQL 等）
- 配置 Web 服务器（Nginx、Apache）
- 启用 HTTPS
- 配置日志和监控
- 设置适当的 CORS 策略
- 实现速率限制（Rate Limiting）
- 添加身份验证和授权

### API Key 安全

永远不要在代码中硬编码 API Key。始终使用环境变量：

```python
# ❌ 不要这样做
DEEPSEEK_API_KEY = "sk-xxxxx"

# ✅ 应该这样做
import os
api_key = os.getenv("DEEPSEEK_API_KEY")
```

## 🐛 故障排除

### 问题：`ModuleNotFoundError: No module named 'app'`

**解决方案**：确保在项目根目录运行命令

```bash
# 正确
cd ai-chat-backend
uvicorn app.main:app --reload

# 错误
cd app
uvicorn main:app --reload
```

### 问题：`SQLAlchemy URL rejected`

**解决方案**：检查 `.env` 中的 `DATABASE_URL` 格式

```env
# SQLite
DATABASE_URL=sqlite:///./ai_chat.db

# PostgreSQL
DATABASE_URL=postgresql://user:password@localhost:5432/dbname
```

### 问题：API Key 未被识别

**解决方案**：

1. 确保 `.env` 文件存在且正确
2. 检查环境变量名称是否与代码匹配
3. 重启应用程序（`USE_MOCK_AI=false` 生效）

```bash
# 验证环境变量是否生效
python -c "from app.core.config import settings; print(settings.deepseek_api_key)"
```

## 📖 相关资源

- [FastAPI 官方文档](https://fastapi.tiangolo.com/)
- [SQLAlchemy 文档](https://docs.sqlalchemy.org/)
- [Pydantic 文档](https://docs.pydantic.dev/)
- [DeepSeek API 文档](https://deepseek.com/api)
- [火山引擎方舟 API 文档](https://www.volcengine.com/docs/82379)
- [OpenAI Python SDK](https://github.com/openai/openai-python)

## 📄 许可证

此项目采用 MIT 许可证。详见 [LICENSE](LICENSE) 文件。

## 🤝 贡献

欢迎提交 Issue 和 PR！

## 💬 支持

如有问题，请：

1. 检查 [FAQ](#常见问题)
2. 查看 [故障排除](#故障排除) 部分
3. 提交 GitHub Issue

---

**祝你开发愉快！** 🎉
