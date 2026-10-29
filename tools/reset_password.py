"""
管理员用的账号工具：重置密码 / 新建账号 / 列出账号
只在命令行使用，不暴露成 API。

用法（在项目根目录执行）：
  python tools/reset_password.py --list                      列出所有账号（用户名 + 角色，不含密码）
  python tools/reset_password.py confur                      重置 confur 的密码（交互输入，不会留在命令历史里）
  python tools/reset_password.py confur 新密码                直接在参数里给出新密码
  python tools/reset_password.py con --create --role admin   账号不存在时新建（例如线上换了新数据库）

操作的是哪个库由 DATABASE_URL 决定，和后端读取方式一致：环境变量 > .env > 默认本地 SQLite。
- 本地：直接执行，改的是 ai_chat.db
- 线上：在 Render 的 Shell 里执行；或在本地临时设置 DATABASE_URL 为 Render 数据库的
  External Database URL 后执行（PowerShell：$env:DATABASE_URL="postgresql://..."）
"""

import argparse
import getpass
import os
import sys
from pathlib import Path

# 让脚本不管从哪个目录启动，都以项目根目录为工作目录：
# 这样 `import app` 能找到包，.env 和默认的 ./ai_chat.db 也能按相对路径找到
ROOT = Path(__file__).resolve().parent.parent
os.chdir(ROOT)
sys.path.insert(0, str(ROOT))

from app.core.security import hash_password  # noqa: E402
from app.db.session import SessionLocal, engine, init_db  # noqa: E402
import app.models  # noqa: E402,F401  注册全部模型，保证关系映射完整
from app.models.user import User  # noqa: E402


def _ask_password(username: str) -> str:
    password = getpass.getpass(f"请输入 {username} 的新密码：")
    if not password:
        print("密码不能为空")
        sys.exit(1)
    if getpass.getpass("再输入一次确认：") != password:
        print("两次输入不一致，未做任何修改")
        sys.exit(1)
    return password


def main() -> None:
    parser = argparse.ArgumentParser(description="重置账号密码 / 新建账号 / 列出账号（仅限管理员在命令行使用）")
    parser.add_argument("username", nargs="?", help="要操作的用户名")
    parser.add_argument("password", nargs="?", help="新密码；不填则交互输入")
    parser.add_argument("--list", action="store_true", help="列出所有账号（用户名 + 角色）")
    parser.add_argument("--create", action="store_true", help="账号不存在时新建，而不是报错")
    parser.add_argument("--role", choices=["user", "admin"], help="新建账号的角色（默认 user）；对已有账号则修改其角色")
    args = parser.parse_args()

    if not args.list and not args.username:
        parser.print_help()
        sys.exit(1)

    print(f"数据库：{engine.url.render_as_string(hide_password=True)}")
    init_db()  # 幂等：表不存在就建、缺列就补，和后端启动时做的一样

    db = SessionLocal()
    try:
        if args.list:
            users = db.query(User).order_by(User.created_at).all()
            if not users:
                print("（没有任何账号）")
            for u in users:
                note = "" if u.password_hash else "  （没有密码，无法登录）"
                print(f"{u.id:>4}  {u.username:<24} {u.role}{note}")
            return

        user = db.query(User).filter(User.username == args.username).first()
        if not user and not args.create:
            print(f"用户不存在：{args.username}（如需新建请加 --create）")
            sys.exit(1)

        password = args.password or _ask_password(args.username)

        if user:
            user.password_hash = hash_password(password)
            if args.role and args.role != user.role:
                user.role = args.role
                print(f"已把 {args.username} 的角色改为 {args.role}")
            db.commit()
            print(f"已重置 {args.username} 的密码")
        else:
            user = User(username=args.username, password_hash=hash_password(password), role=args.role or "user")
            db.add(user)
            db.commit()
            print(f"已新建账号 {args.username}（{user.role}）")
    finally:
        db.close()


if __name__ == "__main__":
    main()
