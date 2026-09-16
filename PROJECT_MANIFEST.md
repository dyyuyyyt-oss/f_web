# 📋 项目文件清单

## 完整的目录树结构

```
ai-chat-backend/
├── app/                              # 应用主目录
│   ├── __init__.py                   # Python 包标记
│   ├── main.py                       # FastAPI 应用入口 & 生命周期管理
│   │
│   ├── core/                         # 核心配置
│   │   ├── __init__.py
│   │   └── config.py                 # 全局配置（环境变量读取）
│   │
│   ├── api/                          # API 层
│   │   ├── __init__.py
│   │   └── routes/                   # 路由集合
│   │       ├── __init__.py
│   │       ├── health.py             # ✅ GET /health 健康检查
│   │       ├── chat.py               # 💬 GET /api/chat/stream 流式聊天
│   │       └── characters.py         # 🎭 GET /api/characters 角色管理
│   │
│   ├── db/                           # 数据库层
│   │   ├── __init__.py
│   │   ├── base.py                   # SQLAlchemy Base 类 & 表名自动生成
│   │   └── session.py                # 数据库会话、引擎创建、初始化
│   │
│   ├── models/                       # 数据库 ORM 模型
│   │   ├── __init__.py
│   │   ├── user.py                   # 👤 User 用户表
│   │   ├── character.py              # 🤖 Character 角色表
│   │   ├── conversation.py           # 💬 Conversation 对话会话表
│   │   └── message.py                # 📝 Message 消息表
│   │
│   ├── schemas/                      # Pydantic 数据验证模型
│   │   ├── __init__.py
│   │   ├── chat.py                   # 聊天相关的请求/响应 Schema
│   │   └── character.py              # 角色相关的 Schema
│   │
│   ├── services/                     # 业务逻辑服务层
│   │   ├── __init__.py
│   │   ├── ai_client.py              # 🤖 AI 客户端（DeepSeek、火山引擎）
│   │   │                             #    · 支持流式响应
│   │   │                             #    · 支持非流式响应
│   │   │                             #    · 错误处理 & 重试
│   │   └── chat_service.py           # 💬 聊天业务逻辑
│   │                                 #    · 模拟流式数据
│   │                                 #    · 真实 AI 调用
│   │                                 #    · 数据库保存
│   │
│   ├── prompts/                      # AI 提示词模板
│   │   ├── __init__.py
│   │   └── character_prompt.py       # 角色提示词构建器
│   │
│   └── utils/                        # 工具函数
│       ├── __init__.py
│       └── streaming.py              # SSE 流式响应工具
│
├── tests/                            # 单元测试
│   ├── __init__.py
│   └── test_api.py                   # API 测试示例
│
├── .env.example                      # 环境变量示例（必看👀）
├── .gitignore                        # Git 忽略规则
├── requirements.txt                  # Python 依赖列表
├── run.py                            # Python 启动脚本
├── run.ps1                           # Windows PowerShell 启动脚本
├── run.sh                            # macOS/Linux 启动脚本
│
├── QUICK_START.md                    # ⚡ 快速开始（5分钟）
├── README.md                         # 📖 完整文档
└── PROJECT_MANIFEST.md               # 📋 本文件
```

## 📝 文件功能说明表

| 文件路径 | 类型 | 功能说明 |
|---------|------|--------|
| `app/main.py` | 📌 核心 | FastAPI 应用入口、CORS、路由注册、生命周期、示例数据插入 |
| `app/core/config.py` | ⚙️ 配置 | 全局配置类、环境变量读取、AI 提供商切换、配置验证 |
| `app/db/base.py` | 🗄️ 数据库 | SQLAlchemy Base 类、表名自动生成 |
| `app/db/session.py` | 🗄️ 数据库 | 数据库引擎创建、会话管理、初始化、关闭 |
| `app/models/user.py` | 📊 模型 | User 表：id, username, email, created_at |
| `app/models/character.py` | 📊 模型 | Character 表：id, name, avatar, persona, greeting, scenario, example_dialogue, created_at |
| `app/models/conversation.py` | 📊 模型 | Conversation 表：id, user_id, character_id, title, created_at, updated_at |
| `app/models/message.py` | 📊 模型 | Message 表：id, conversation_id, role, content, created_at |
| `app/schemas/chat.py` | 📋 Schema | ChatMessageInput、ChatStreamResponse、ConversationSchema |
| `app/schemas/character.py` | 📋 Schema | CharacterCreateSchema、CharacterResponseSchema |
| `app/services/ai_client.py` | 🤖 AI | AIClient 类、流式/非流式聊天、错误处理、多提供商支持 |
| `app/services/chat_service.py` | 💬 服务 | ChatService 类、模拟/真实 AI 切换、数据库保存、对话历史 |
| `app/prompts/character_prompt.py` | 💭 提示词 | 系统提示词生成、示例对话格式化 |
| `app/utils/streaming.py` | 🛠️ 工具 | SSE 事件流生成、异步生成器转换 |
| `app/api/routes/health.py` | 🔗 路由 | GET /health 健康检查接口 |
| `app/api/routes/chat.py` | 🔗 路由 | GET /api/chat/stream 流式聊天、POST /api/chat/send 非流式聊天 |
| `app/api/routes/characters.py` | 🔗 路由 | GET /api/characters 列表、GET /api/characters/{id} 详情、POST 创建 |
| `tests/test_api.py` | 🧪 测试 | 基础 API 测试示例 |
| `.env.example` | 📄 配置 | 环境变量示例（**必须复制为 .env**） |
| `requirements.txt` | 📦 依赖 | Python 依赖列表 |
| `run.py` | 🚀 脚本 | Python 启动脚本（跨平台） |
| `run.ps1` | 🚀 脚本 | Windows PowerShell 启动脚本 |
| `run.sh` | 🚀 脚本 | macOS/Linux 启动脚本 |
| `README.md` | 📖 文档 | 完整使用文档 |
| `QUICK_START.md` | ⚡ 文档 | 5 分钟快速开始 |

## 🔑 关键文件说明

### 1. app/main.py - 应用主入口

**功能：**
- FastAPI 应用创建
- CORS 中间件配置
- 路由注册
- 应用生命周期事件（startup/shutdown）
- 示例数据插入

**代码特点：**
```python
# 生命周期管理
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: 初始化数据库、插入示例数据
    # Shutdown: 关闭数据库连接
    ...

# 自动创建示例数据
def _insert_sample_data():
    # 创建示例用户: demo_user
    # 创建示例角色: 星野🌟
    # 创建示例对话记录
    ...
```

### 2. app/core/config.py - 全局配置

**功能：**
- 从 `.env` 读取所有环境变量
- 提供类型安全的配置对象
- 支持 AI 提供商切换
- 配置验证

**支持的环境变量：**
```env
AI_PROVIDER=deepseek|volcengine    # AI 提供商选择
USE_MOCK_AI=true|false             # 模拟/真实 API 切换
DEEPSEEK_API_KEY=sk-xxx            # DeepSeek API Key
VOLCENGINE_API_KEY=xxx             # 火山引擎 API Key
```

### 3. app/services/ai_client.py - AI 客户端封装

**功能：**
- 支持 DeepSeek 和火山引擎方舟
- 流式和非流式调用
- 错误处理和重试机制
- 工厂函数获取客户端

**使用方式：**
```python
from app.services.ai_client import get_ai_client

# 获取客户端
client = get_ai_client(provider="deepseek")

# 流式调用
async for chunk in client.stream_chat(messages):
    print(chunk, end="", flush=True)

# 非流式调用
response = await client.chat(messages)
```

### 4. app/services/chat_service.py - 聊天业务服务

**功能：**
- 模拟 AI 流（打字机效果）
- 真实 AI 调用
- 消息持久化
- 对话历史管理

**特点：**
- 根据 `USE_MOCK_AI` 环境变量自动切换
- 支持创建新对话或续接已有对话
- 自动保存用户消息和 AI 回复

### 5. app/api/routes/chat.py - 聊天接口

**核心接口：**
```
GET /api/chat/stream?message=xxx&character_id=1&user_id=1
```

**返回格式（SSE）：**
```
data: 你
data: 好
data: ！
...
event: done
data: [DONE]
```

## 🚀 快速启动

```bash
# 1. 进入项目
cd ai-chat-backend

# 2. 创建虚拟环境
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# 3. 安装依赖
pip install -r requirements.txt

# 4. 复制配置
cp .env.example .env

# 5. 启动服务
uvicorn app.main:app --reload

# 6. 访问 API 文档
# http://localhost:8000/docs
```

## 📦 核心依赖

- **FastAPI 0.104+** - Web 框架
- **SQLAlchemy 2.0+** - ORM
- **Pydantic 2.5+** - 数据验证
- **OpenAI SDK 1.6+** - AI 客户端
- **sse-starlette 2.0+** - SSE 流式响应
- **python-dotenv** - 环境变量管理

## 🎯 MVP 范围

✅ **已实现：**
- FastAPI 基础框架
- SQLAlchemy ORM & 数据模型
- Pydantic 数据验证
- 多 AI 提供商支持（DeepSeek、火山引擎）
- SSE 流式响应
- 模拟 AI 模式
- CORS 跨域支持
- 健康检查端点
- 示例角色和对话

❌ **TODO（后续实现）：**
- 用户认证与授权（JWT）
- 用户注册/登录
- 角色市场与发布机制
- 支付集成
- 语音识别与合成
- WebSocket 长连接
- 内容审核系统
- Docker 容器化
- 生产环境部署

## 🔗 相关资源

- [FastAPI 官方文档](https://fastapi.tiangolo.com/)
- [SQLAlchemy 2.0 文档](https://docs.sqlalchemy.org/)
- [Pydantic v2 文档](https://docs.pydantic.dev/v2/)
- [DeepSeek API 文档](https://deepseek.com/api)
- [火山引擎方舟](https://www.volcengine.com/docs/82379)
- [OpenAI Python SDK](https://github.com/openai/openai-python)

---

**最后更新**: 2024-01-15
**版本**: 0.1.0 (MVP)
