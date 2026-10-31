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


VOICES = [
    {"id": "zh-CN-XiaoyiNeural", "name": "晓伊", "desc": "少女，清亮"},
    {"id": "zh-CN-XiaoxiaoNeural", "name": "晓晓", "desc": "温柔，播音"},
    {"id": "zh-CN-XiaobeiNeural", "name": "晓北", "desc": "活泼，东北"},
    {"id": "zh-CN-XiaomoNeural", "name": "晓墨", "desc": "沉静，御姐"},
    {"id": "zh-CN-XiaohanNeural", "name": "晓涵", "desc": "温婉，故事感"},
    {"id": "zh-CN-YunxiNeural", "name": "云希", "desc": "清朗少年"},
    {"id": "zh-TW-HsiaoChenNeural", "name": "曉臻", "desc": "台湾腔"},
]


def _clamp(v, lo=0, hi=100):
    return int(max(lo, min(hi, v)))


def _metrics(db: Session) -> dict:
    """全部从 message 表真实统计，没有任何随机数。"""
    now = time.time()
    rows = db.execute(text(
        "SELECT content, role, created_at FROM message ORDER BY id DESC LIMIT 500"
    )).fetchall()

    def ts(v):
        from datetime import datetime
        try:
            if hasattr(v, "timestamp"):
                return v.timestamp()
            if isinstance(v, str):
                return datetime.fromisoformat(v.replace("Z", "")).timestamp()
            return float(v)
        except Exception:
            return 0.0

    stamps = [ts(r[2]) for r in rows if r[2] is not None]
    last_ts = max(stamps) if stamps else 0
    hours_since = (now - last_ts) / 3600 if last_ts else 999

    one_day = now - 86400
    today = sum(1 for s in stamps if s >= one_day)
    week = [s for s in stamps if s >= now - 7 * 86400]
    avg7 = len(week) / 7.0

    days = sorted({time.strftime("%Y-%m-%d", time.localtime(s)) for s in stamps}, reverse=True)
    streak = 0
    if days:
        from datetime import date, timedelta
        cur = date.today()
        dset = set(days)
        while cur.isoformat() in dset:
            streak += 1
            cur -= timedelta(days=1)
    days_since = 0 if not last_ts else int((now - last_ts) // 86400)

    user_msgs = [r for r in rows if r[1] == "user"]
    saw = (user_msgs[0][0] or "")[:18] if user_msgs else "还没聊过"

    return {
        "total": len(rows),
        "today": today,
        "avg7": round(avg7, 1),
        "hours_since": round(hours_since, 1),
        "streak": streak,
        "days_since": days_since,
        "saw": saw,
    }


@router.get("/life/health", summary="生活面板 · 健康状态")
def life_health(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    m = _metrics(db)

    hunger = _clamp(5 + m["hours_since"] * 3.2)
    labels = [(12, "饱饱的"), (32, "还行"), (52, "有点饿"), (72, "饿了"), (90, "饿扁了"), (101, "要饿死了")]
    label = next(v for k, v in labels if hunger < k)

    dopamine = _clamp(18 + 55 * min(1.0, m["today"] / max(1.0, m["avg7"])) + m["today"] * 2)
    oxytocin = _clamp(8 + m["streak"] * 13)
    cortisol = _clamp(4 + (0 if m["hours_since"] < 6 else m["hours_since"] - 6) * 2.6)
    serotonin = _clamp(10 + m["avg7"] * 9)
    nor = _clamp(92 - m["hours_since"] * 9 if m["hours_since"] < 10 else 6)

    bal = deepseek_balance()
    return {
        "hunger": {
            "value": hunger, "label": label,
            "note": "按「距离上一条消息 %.0f 小时」推算" % m["hours_since"],
        },
        "wallet": {
            "balance": bal,
            "note": "DeepSeek 余额接口" if bal is not None else "当前走火山方舟，无余额接口",
        },
        "neuro": [
            {"name": "多巴胺", "v": dopamine, "color": "#f6c04a", "basis": "今日 %d 条 / 7 日均 %.1f 条" % (m["today"], m["avg7"])},
            {"name": "催产素", "v": oxytocin, "color": "#5ec8f2", "basis": "连续聊了 %d 天" % m["streak"]},
            {"name": "皮质醇", "v": cortisol, "color": "#f2695c", "basis": "距上次 %.0f 小时" % m["hours_since"]},
            {"name": "血清素", "v": serotonin, "color": "#a98bf0", "basis": "7 日均 %.1f 条/天" % m["avg7"]},
            {"name": "去甲肾上腺素", "v": nor, "color": "#6fe0a0", "basis": "最近 10 小时内是否活跃"},
        ],
        "status": {"mood": "平静" if cortisol < 40 else ("有点想你" if cortisol < 75 else "被冷落")},
        "saw": {"name": m["saw"], "note": "来自最近一条真实消息"},
        "basis": m,
    }


@router.get("/life/voices", summary="生活面板 · 可选声线")
def life_voices(user: User = Depends(get_current_user)):
    return {"voices": VOICES}


class TtsIn(BaseModel):
    text: str
    voice: str = "zh-CN-XiaoyiNeural"
    rate: str = "+0%"
    pitch: str = "+0Hz"


@router.post("/life/tts", summary="生活面板 · 神经语音合成")
async def life_tts(payload: TtsIn, user: User = Depends(get_current_user)):
    import edge_tts
    from fastapi.responses import Response

    text = (payload.text or "").strip()[:300]
    if not text:
        return Response(status_code=400)
    try:
        comm = edge_tts.Communicate(text, payload.voice, rate=payload.rate, pitch=payload.pitch)
        buf = bytearray()
        async for chunk in comm.stream():
            if chunk["type"] == "audio":
                buf.extend(chunk["data"])
        return Response(content=bytes(buf), media_type="audio/mpeg",
                        headers={"Cache-Control": "no-store"})
    except Exception as exc:
        return Response(content=str(exc)[:200].encode(), status_code=503, media_type="text/plain")


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
async def life_chat(payload: ChatIn, user: User = Depends(get_current_user)):
    from app.services.ai_client import AIClient

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
        client = AIClient(provider=settings.ai_provider)
        result = await client.chat(
            messages=[
                {"role": "system", "content": persona},
                {"role": "user", "content": payload.text},
            ],
            temperature=1.0,
            max_tokens=900,
        )
        reply = result.get("content", "") if isinstance(result, dict) else str(result or "")
        reply = reply.strip()
        if not reply:
            raise RuntimeError("模型返回空内容")
        return {"ok": True, "reply": reply}
    except Exception as exc:
        return {"ok": False, "error": str(exc)[:200]}
