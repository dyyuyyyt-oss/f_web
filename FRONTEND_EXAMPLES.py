"""
前端集成示例
展示如何在前端调用后端 API
"""

# ============================================================
# HTML + JavaScript 示例
# ============================================================

html_example = """
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI 聊天示例</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .chat-box { border: 1px solid #ddd; border-radius: 8px; padding: 20px; height: 400px; overflow-y: auto; }
        .message { margin: 10px 0; padding: 10px; border-radius: 4px; }
        .message.user { background: #e8f5e9; text-align: right; }
        .message.assistant { background: #e3f2fd; text-align: left; }
        input, button { padding: 10px; margin: 5px 0; width: 100%; }
        button { cursor: pointer; background: #2196F3; color: white; border: none; border-radius: 4px; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🤖 AI 角色扮演聊天</h1>
        <div class="chat-box" id="chatBox"></div>
        <input type="text" id="messageInput" placeholder="输入你的消息...">
        <button onclick="sendMessage()">发送</button>
        <p id="status">等待连接...</p>
    </div>

    <script>
        const API_BASE = "http://localhost:8000";
        let characterId = 1;
        let conversationId = null;

        // 检查健康状态
        async function checkHealth() {
            try {
                const response = await fetch(API_BASE + "/health");
                const data = await response.json();
                document.getElementById("status").innerText = 
                    `✅ 已连接 | AI: ${data.ai_provider} | 模拟: ${data.use_mock_ai}`;
            } catch (error) {
                document.getElementById("status").innerText = "❌ 无法连接到服务器";
            }
        }

        // 发送消息
        function sendMessage() {
            const input = document.getElementById("messageInput");
            const message = input.value.trim();
            if (!message) return;

            // 显示用户消息
            addMessage(message, "user");
            input.value = "";

            // 调用 SSE 接口获取 AI 回复
            streamChat(message);
        }

        // SSE 流式聊天
        function streamChat(message) {
            const url = new URL(API_BASE + "/api/chat/stream");
            url.searchParams.append("message", message);
            url.searchParams.append("character_id", characterId);
            if (conversationId) {
                url.searchParams.append("conversation_id", conversationId);
            }

            const eventSource = new EventSource(url);
            let aiMessage = "";

            // 创建 AI 消息容器（待更新）
            const messageDiv = document.createElement("div");
            messageDiv.className = "message assistant";
            document.getElementById("chatBox").appendChild(messageDiv);

            eventSource.addEventListener("message", (event) => {
                aiMessage += event.data;
                messageDiv.innerText = aiMessage;
                // 自动滚动到底部
                document.getElementById("chatBox").scrollTop = 
                    document.getElementById("chatBox").scrollHeight;
            });

            eventSource.addEventListener("done", () => {
                eventSource.close();
                // 记录对话 ID（用于续接对话）
                // 可以从响应中获取
            });

            eventSource.addEventListener("error", (event) => {
                eventSource.close();
                messageDiv.innerText = "❌ 发生错误，请重试";
            });
        }

        // 显示消息
        function addMessage(text, role) {
            const chatBox = document.getElementById("chatBox");
            const messageDiv = document.createElement("div");
            messageDiv.className = `message ${role}`;
            messageDiv.innerText = text;
            chatBox.appendChild(messageDiv);
            chatBox.scrollTop = chatBox.scrollHeight;
        }

        // 获取角色列表
        async function loadCharacters() {
            try {
                const response = await fetch(API_BASE + "/api/characters");
                const characters = await response.json();
                console.log("可用角色:", characters);
                if (characters.length > 0) {
                    characterId = characters[0].id;
                    addMessage(`已选择角色: ${characters[0].name}`, "assistant");
                }
            } catch (error) {
                console.error("获取角色失败:", error);
            }
        }

        // 初始化
        document.addEventListener("DOMContentLoaded", () => {
            checkHealth();
            loadCharacters();
            
            // Enter 发送
            document.getElementById("messageInput").addEventListener("keypress", (e) => {
                if (e.key === "Enter") sendMessage();
            });
        });
    </script>
</body>
</html>
"""

# ============================================================
# React 组件示例
# ============================================================

react_example = """
import React, { useState, useEffect, useRef } from 'react';

const ChatComponent = () => {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState("");
    const [status, setStatus] = useState("加载中...");
    const [characters, setCharacters] = useState([]);
    const [selectedCharacterId, setSelectedCharacterId] = useState(1);
    const chatBoxRef = useRef(null);

    const API_BASE = "http://localhost:8000";

    // 检查服务状态
    useEffect(() => {
        checkHealth();
        loadCharacters();
    }, []);

    // 自动滚动到底部
    useEffect(() => {
        if (chatBoxRef.current) {
            chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
        }
    }, [messages]);

    const checkHealth = async () => {
        try {
            const response = await fetch(`${API_BASE}/health`);
            const data = await response.json();
            setStatus(`✅ AI: ${data.ai_provider} | 模拟: ${data.use_mock_ai}`);
        } catch {
            setStatus("❌ 无法连接");
        }
    };

    const loadCharacters = async () => {
        try {
            const response = await fetch(`${API_BASE}/api/characters`);
            const data = await response.json();
            setCharacters(data);
            if (data.length > 0) {
                setSelectedCharacterId(data[0].id);
            }
        } catch (error) {
            console.error("获取角色失败:", error);
        }
    };

    const sendMessage = async () => {
        if (!input.trim()) return;

        // 添加用户消息
        setMessages((prev) => [...prev, { role: "user", content: input }]);
        const userMessage = input;
        setInput("");

        // 流式获取 AI 回复
        const url = new URL(`${API_BASE}/api/chat/stream`);
        url.searchParams.append("message", userMessage);
        url.searchParams.append("character_id", selectedCharacterId);

        const eventSource = new EventSource(url);
        let aiResponse = "";

        eventSource.addEventListener("message", (event) => {
            aiResponse += event.data;
            // 更新最后一条消息（AI 消息）
            setMessages((prev) => {
                const updated = [...prev];
                if (updated.length > 0 && updated[updated.length - 1].role === "assistant") {
                    updated[updated.length - 1].content = aiResponse;
                } else {
                    updated.push({ role: "assistant", content: aiResponse });
                }
                return updated;
            });
        });

        eventSource.addEventListener("done", () => {
            eventSource.close();
        });

        eventSource.addEventListener("error", () => {
            eventSource.close();
        });
    };

    return (
        <div style={{ maxWidth: "600px", margin: "0 auto", padding: "20px" }}>
            <h1>🤖 AI 聊天</h1>
            <p>{status}</p>

            {characters.length > 0 && (
                <select 
                    value={selectedCharacterId} 
                    onChange={(e) => setSelectedCharacterId(Number(e.target.value))}
                >
                    {characters.map((char) => (
                        <option key={char.id} value={char.id}>
                            {char.name}
                        </option>
                    ))}
                </select>
            )}

            <div 
                ref={chatBoxRef}
                style={{
                    border: "1px solid #ddd",
                    borderRadius: "8px",
                    padding: "20px",
                    height: "400px",
                    overflow: "auto",
                    marginTop: "10px",
                }}
            >
                {messages.map((msg, idx) => (
                    <div
                        key={idx}
                        style={{
                            marginBottom: "10px",
                            padding: "10px",
                            borderRadius: "4px",
                            background: msg.role === "user" ? "#e8f5e9" : "#e3f2fd",
                            textAlign: msg.role === "user" ? "right" : "left",
                        }}
                    >
                        {msg.content}
                    </div>
                ))}
            </div>

            <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyPress={(e) => e.key === "Enter" && sendMessage()}
                    placeholder="输入消息..."
                    style={{ flex: 1, padding: "10px" }}
                />
                <button onClick={sendMessage} style={{ padding: "10px 20px" }}>
                    发送
                </button>
            </div>
        </div>
    );
};

export default ChatComponent;
"""

# ============================================================
# Python 客户端示例（使用 httpx）
# ============================================================

python_example = """
import asyncio
import httpx
from typing import AsyncGenerator

class AIChatClient:
    def __init__(self, base_url: str = "http://localhost:8000"):
        self.base_url = base_url

    async def check_health(self) -> dict:
        '''检查服务状态'''
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{self.base_url}/health")
            return response.json()

    async def get_characters(self) -> list:
        '''获取角色列表'''
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{self.base_url}/api/characters")
            return response.json()

    async def stream_chat(
        self, 
        message: str, 
        character_id: int = 1
    ) -> AsyncGenerator[str, None]:
        '''流式聊天，SSE 格式'''
        url = f"{self.base_url}/api/chat/stream"
        params = {
            "message": message,
            "character_id": character_id,
        }

        async with httpx.AsyncClient() as client:
            async with client.stream("GET", url, params=params) as response:
                async for line in response.aiter_lines():
                    if line.startswith("data: "):
                        yield line[6:]  # 去掉 "data: " 前缀

async def main():
    client = AIChatClient()

    # 检查健康状态
    health = await client.check_health()
    print(f"✅ 服务状态: {health}")

    # 获取角色列表
    characters = await client.get_characters()
    print(f"📋 可用角色: {len(characters)} 个")
    for char in characters:
        print(f"  - {char['name']}: {char['persona'][:50]}")

    # 流式聊天
    print("\\n💬 开始对话:")
    async for chunk in client.stream_chat("你好，很高兴认识你！"):
        print(chunk, end="", flush=True)
    print("\\n✅ 对话完成")

if __name__ == "__main__":
    asyncio.run(main())
"""

# 导出示例
if __name__ == "__main__":
    print("HTML 示例:")
    print(html_example)
    print("\n" + "="*60 + "\n")
    print("React 示例:")
    print(react_example)
    print("\n" + "="*60 + "\n")
    print("Python 客户端示例:")
    print(python_example)
