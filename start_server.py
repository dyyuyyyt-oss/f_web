#!/usr/bin/env python
"""启动 FastAPI 服务器的脚本"""

import subprocess
import sys

if __name__ == "__main__":
    # 使用 uvicorn 启动服务器
    subprocess.run([
        sys.executable, 
        "-m", 
        "uvicorn", 
        "app.main:app",
        "--reload",
        "--host", 
        "127.0.0.1",
        "--port",
        "8000"
    ])
