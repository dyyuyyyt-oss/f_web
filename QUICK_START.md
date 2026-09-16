# 🚀 快速开始指南

这是一份简化的快速开始指南，5 分钟内让服务跑起来。

## 1️⃣ 进入项目目录

```bash
cd ai-chat-backend
```

## 2️⃣ 创建虚拟环境（推荐）

### Windows

```bash
python -m venv venv
venv\Scripts\activate
```

### macOS / Linux

```bash
python3 -m venv venv
source venv/bin/activate
```

## 3️⃣ 安装依赖

```bash
pip install -r requirements.txt
```

## 4️⃣ 配置 .env 文件

```bash
# 从示例创建 .env
Windows: copy .env.example .env
macOS/Linux: cp .env.example .env
```

**默认配置已支持模拟 AI，无需配置 API Key，可直接使用！**

## 5️⃣ 启动服务

### 方式一：使用启动脚本

**Windows:**
```bash
python run.py
# 或者
./run.ps1
```

**macOS / Linux:**
```bash
python run.py
# 或者
bash run.sh
```

### 方式二：直接使用 uvicorn

```bash
uvicorn app.main:app --reload
```

## ✅ 验证成功

服务启动后，访问以下 URL：

- **API 文档**: http://localhost:8000/docs (Swagger UI)
- **健康检查**: http://localhost:8000/health
- **角色列表**: http://localhost:8000/api/characters

## 🧪 测试聊天接口

### 在浏览器中测试

打开 http://localhost:8000/docs，找到 `/api/chat/stream` 接口，点击 "Try it out"：

```
GET /api/chat/stream?message=你好&character_id=1
```

### 使用 curl

```bash
curl "http://localhost:8000/api/chat/stream?message=你好&character_id=1"
```

### 在 JavaScript 中测试

```javascript
const eventSource = new EventSource(
  "http://localhost:8000/api/chat/stream?message=你好&character_id=1"
);

eventSource.addEventListener("message", (event) => {
  console.log(event.data);
});

eventSource.addEventListener("done", () => {
  eventSource.close();
});
```

## 🤖 切换 AI 提供商

编辑 `.env` 文件：

### 使用 DeepSeek（默认）

```env
AI_PROVIDER=deepseek
USE_MOCK_AI=true  # 或改为 false 使用真实 API
DEEPSEEK_API_KEY=sk-xxxxx
```

### 使用火山引擎方舟

```env
AI_PROVIDER=volcengine
USE_MOCK_AI=false
VOLCENGINE_API_KEY=your-api-key
VOLCENGINE_MODEL=ep-xxxxx
```

**修改后需重启服务生效！**

## 🐛 遇到问题

| 问题 | 解决方案 |
|------|--------|
| `ModuleNotFoundError: No module named 'app'` | 确保在项目根目录运行 |
| 找不到 `.env` 文件 | 从 `.env.example` 复制一份 |
| 依赖缺失 | 运行 `pip install -r requirements.txt` |
| 端口被占用 | 修改 `uvicorn app.main:app --reload --port 8001` |

## 📚 下一步

- 查看完整的 [README.md](README.md) 了解更多细节
- 访问 http://localhost:8000/docs 查看 API 完整文档
- 配置真实的 AI API Key（DeepSeek 或火山引擎）
- 开始开发前端应用

## 💡 提示

- 默认使用 **SQLite** 数据库（`ai_chat.db`）
- 默认使用 **模拟 AI**（无需 API Key）
- 应用启动时自动创建示例角色 "星野🌟"
- 所有配置通过环境变量管理，**不要把 API Key 写进代码**

---

**祝你开发愉快！** 🎉
