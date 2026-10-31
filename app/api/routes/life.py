"""生活面板：健康状态 / 记忆星图 / 皮套对话。

数据全部来自站内真实数据（message / character 表）+ DeepSeek 真实余额。
状态存 life_state.json（单用户站点，全局一份）。
"""
from __future__ import annotations

import json
import math
import random
import time
import urllib.request
from pathlib import Path

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import settings
from app.db.session import get_db
from app.models.user import User

router = APIRouter(tags=["生活面板"])

STATE_FILE = Path(__file__).resolve().parents[2] / "life_state.json"

DEFAULT_STATE = {
    "hunger_base": 8,
    "last_feed": 0,
    "mood": "平静",
    "dopamine": 39,
    "oxytocin": 55,
    "cortisol": 9,
    "serotonin": 56,
    "norepinephrine": 28,
    "saw": {"name": "蛋糕", "note": "甜、奶油、常温、松软，很合胃口"},
}


def load_state() -> dict:
    data = dict(DEFAULT_STATE)
    if STATE_FILE.exists():
        try:
            data.update(json.loads(STATE_FILE.read_text(encoding="utf-8")))
        except Exception:
            pass
    if not data.get("last_feed"):
        data["last_feed"] = time.time()
    return data


def save_state(st: dict) -> None:
    try:
        STATE_FILE.write_text(json.dumps(st, ensure_ascii=False), encoding="utf-8")
    except Exception:
        pass


_balance = {"at": 0.0, "value": None}


def deepseek_balance():
    if time.time() - _balance["at"] < 300:
        return _balance["value"]
    key = settings.deepseek_api_key
    if not key:
        _balance["value"] = None
        _balance["at"] = time.time()
        return None
    try:
        req = urllib.request.Request(
            "https://api.deepseek.com/user/balance",
            headers={"Authorization": "Bearer " + key},
        )
        with urllib.request.urlopen(req, timeout=8) as resp:
            data = json.loads(resp.read().decode())
        info = (data.get("balance_infos") or [{}])[0]
        _balance["value"] = round(float(info.get("total_balance", 0)), 2)
    except Exception:
        _balance["value"] = None
    _balance["at"] = time.time()
    return _balance["value"]


@router.get("/life/health", summary="生活面板 · 健康状态")
def life_health(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    st = load_state()
    hours = max(0.0, (time.time() - float(st["last_feed"])) / 3600.0)
    hunger = int(min(100, 6 + hours * 4.5))
    labels = [(10, "饱饱的"), (30, "还行"), (50, "有点饿"), (70, "饿了"), (88, "饿扁了"), (101, "要饿死了")]
    label = next(v for k, v in labels if hunger < k)

    bal = deepseek_balance()
    return {
        "hunger": {"value": hunger, "label": label,
                   "note": "正常：喂食会让她恢复活力"},
        "wallet": {"balance": bal,
                   "note": "饭钱还够，安心" if (bal or 0) >= 10 else "低于 10 元会触发生存压力"},
        "neuro": [
            {"name": "多巴胺", "v": st["dopamine"], "color": "#f6c04a"},
            {"name": "催产素", "v": st["oxytocin"], "color": "#5ec8f2"},
            {"name": "皮质醇", "v": st["cortisol"], "color": "#f2695c"},
            {"name": "血清素", "v": st["serotonin"], "color": "#a98bf0"},
            {"name": "去甲肾上腺素", "v": st["norepinephrine"], "color": "#6fe0a0"},
        ],
        "status": {"mood": st["mood"]},
        "saw": st["saw"],
    }


@router.post("/life/feed", summary="生活面板 · 喂一口")
def life_feed(user: User = Depends(get_current_user)):
    st = load_state()
    st["last_feed"] = time.time()
    st["dopamine"] = min(100, int(st["dopamine"]) + 8)
    st["serotonin"] = min(100, int(st["serotonin"]) + 4)
    save_state(st)
    return {"ok": True}


@router.get("/life/graph", summary="生活面板 · 记忆星图")
def life_graph(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    rng = random.Random(20261031)
    nodes = [{"id": "self", "x": 0, "y": 0, "r": 13, "kind": "self", "label": "她"}]
    edges = [{"a": "self", "b": "self", "w": 0}]

    rows, chars, days = [], [], 0
    try:
        rows = db.execute(text(
            "SELECT content, created_at, role, speaker_id FROM message ORDER BY id DESC LIMIT 300"
        )).fetchall()
    except Exception:
        rows = []
    try:
        chars = db.execute(text("SELECT id, name FROM character")).fetchall()
    except Exception:
        chars = []
    try:
        days = db.execute(text("SELECT COUNT(DISTINCT date(created_at)) FROM message")).scalar() or 0
    except Exception:
        days = 0

    edges = []
    for i, r in enumerate(rows[:220]):
        ang = rng.uniform(0, 2 * math.pi)
        dist = rng.uniform(0.3, 1.0) ** 0.85
        nodes.append({"id": "m%d" % i, "x": math.cos(ang) * dist, "y": math.sin(ang) * dist,
                      "r": 1.2 + rng.random() * 1.6, "kind": "msg",
                      "label": (r[0] or "")[:36], "v": 0})
    for i, c in enumerate(chars[:12]):
        ang = rng.uniform(0, 2 * math.pi)
        dist = rng.uniform(0.2, 0.5)
        nodes.append({"id": "c%d" % i, "x": math.cos(ang) * dist, "y": math.sin(ang) * dist,
                      "r": 6.5, "kind": "fact", "label": "角色 · " + (c[1] or ""), "v": 1})
        edges.append({"a": "self", "b": "c%d" % i, "w": 0.6})

    return {
        "nodes": nodes, "edges": edges,
        "stats": {"memories": len(chars), "episodes": len(rows), "days": int(days), "relations": len(chars)},
    }


class ChatIn(BaseModel):
    text: str


@router.post("/life/chat", summary="生活面板 · 皮套对话")
def life_chat(payload: ChatIn, user: User = Depends(get_current_user)):
    from openai import OpenAI

    st = load_state()
    st["dopamine"] = min(100, int(st["dopamine"]) + 3)
    st["oxytocin"] = min(100, int(st["oxytocin"]) + 2)
    st["cortisol"] = max(0, int(st["cortisol"]) - 2)
    save_state(st)

    persona = (
        "你是「大肥鱼」，一条成了精的胖鱼，住在对方的聊天窗口里。懒、馋、嘴毒心软。\n"
        "说话像微信老朋友：短句、口语，偶尔一个括号动作，一次最多一个。\n"
        "不自称 AI，不解释设定，不列点。一次回复 1~3 句，不超过 80 字。"
    )
    try:
        client = OpenAI(api_key=settings.deepseek_api_key, base_url=settings.deepseek_base_url)
        resp = client.chat.completions.create(
            model=settings.deepseek_model,
            messages=[{"role": "system", "content": persona},
                      {"role": "user", "content": payload.text}],
            temperature=1.0,
            max_tokens=900,
        )
        content = (resp.choices[0].message.content or "").strip()
        if not content:
            raise RuntimeError("模型返回空内容")
        return {"ok": True, "reply": content}
    except Exception as exc:
        return {"ok": False, "error": str(exc)[:200]}
