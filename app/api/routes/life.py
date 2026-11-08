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


def _pet_chat_table(db: Session) -> None:
    """SQLite / Postgres 都能建的自增主键。"""
    try:
        dialect = db.bind.dialect.name if db.bind is not None else "sqlite"
    except Exception:
        dialect = "sqlite"
    if dialect == "sqlite":
        ddl = ("CREATE TABLE IF NOT EXISTS pet_chat ("
               "id INTEGER PRIMARY KEY AUTOINCREMENT, role VARCHAR(16), content TEXT, created_at VARCHAR(32))")
    else:
        ddl = ("CREATE TABLE IF NOT EXISTS pet_chat ("
               "id BIGSERIAL PRIMARY KEY, role VARCHAR(16), content TEXT, created_at VARCHAR(32))")
    db.execute(text(ddl))
    db.commit()


def _rebuild_memory_block(db: Session) -> str:
    """把最近网页对话压成一段，供 QQ 侧注入。"""
    try:
        _pet_chat_table(db)
        rows = db.execute(text(
            "SELECT role, content FROM pet_chat ORDER BY id DESC LIMIT 12"
        )).fetchall()
    except Exception:
        return ""
    if not rows:
        return ""
    lines = []
    for role, content in reversed(rows):
        who = "他" if role == "user" else "我"
        lines.append("%s：%s" % (who, (content or "")[:60]))
    block = "（你们在网页上也聊过）\n" + "\n".join(lines)
    block = block[:600]
    try:
        db.execute(text(
            "INSERT INTO pet_settings(k, v) VALUES('memory_block', :v) "
            "ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v"
        ), {"v": json.dumps(block)})
        db.commit()
    except Exception:
        pass
    return block


@router.get("/life/history", summary="大肥鱼 · 网页聊天记录")
def life_history(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    try:
        _pet_chat_table(db)
        rows = db.execute(text(
            "SELECT role, content FROM pet_chat ORDER BY id DESC LIMIT 40"
        )).fetchall()
    except Exception:
        rows = []
    return {"messages": [{"role": r[0], "content": r[1]} for r in reversed(rows)]}


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
async def life_chat(payload: ChatIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
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
        _pet_chat_table(db)
        db.execute(text("INSERT INTO pet_chat(role, content, created_at) VALUES('user', :c, :t)"),
                   {"c": payload.text[:500], "t": time.strftime("%Y-%m-%d %H:%M:%S")})
        db.commit()
    except Exception:
        pass

    try:
        _vst = _drift(_load(db))
        _vst = _react(_vst, payload.text)
        _save(db, _vst)
    except Exception:
        pass

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
        try:
            db.execute(text("INSERT INTO pet_chat(role, content, created_at) VALUES('assistant', :c, :t)"),
                       {"c": reply[:500], "t": time.strftime("%Y-%m-%d %H:%M:%S")})
            db.commit()
            _rebuild_memory_block(db)
        except Exception:
            pass
        return {"ok": True, "reply": reply}
    except Exception as exc:
        return {"ok": False, "error": str(exc)[:200]}


# ---------------- 机器人可调参数（网页里改，机器人轮询生效） ----------------
DEFAULT_PET = {"voice": "zh-CN-XiaoruiNeural", "prob": 0.18, "delay_min": 2.5, "delay_max": 6.5}


def _pet_table(db: Session) -> None:
    db.execute(text("CREATE TABLE IF NOT EXISTS pet_settings (k VARCHAR(64) PRIMARY KEY, v TEXT)"))
    db.commit()


@router.get("/life/pet-settings", summary="机器人声线等参数（机器人轮询用，无需登录）")
def get_pet_settings(db: Session = Depends(get_db)):
    try:
        _pet_table(db)
        rows = db.execute(text("SELECT k, v FROM pet_settings")).fetchall()
    except Exception:
        rows = []
    data = dict(DEFAULT_PET)
    for r in rows:
        try:
            data[r[0]] = json.loads(r[1])
        except Exception:
            data[r[0]] = r[1]
    return data


class PetIn(BaseModel):
    voice: str | None = None
    prob: float | None = None
    delay_min: float | None = None
    delay_max: float | None = None


@router.post("/life/pet-settings", summary="修改机器人声线等参数")
def set_pet_settings(payload: PetIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _pet_table(db)
    patch = {k: v for k, v in payload.model_dump().items() if v is not None}
    for k, v in patch.items():
        db.execute(text(
            "INSERT INTO pet_settings(k, v) VALUES(:k, :v) "
            "ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v"
        ), {"k": k, "v": json.dumps(v)})
    db.commit()
    return {"ok": True, "saved": patch}


# ================= 生命状态（按《生命状态-完整实施指南 v2》第 5 章原式） =================

def clamp(x):
    return max(0.0, min(1.0, float(x)))


def follow(x, target, half_life_hours, hours):
    """文档核心公式：x + (target-x) * (1 - 0.5**(hours/tau))"""
    if half_life_hours <= 0:
        return clamp(target)
    return clamp(x + (target - x) * (1 - 0.5 ** (hours / half_life_hours)))


DEFAULTS = {
    "hunger": 0.35, "thirst": 0.28, "adenosine": 0.20, "immune": 0.82,
    "dopamine": 0.45, "serotonin": 0.55, "oxytocin": 0.50, "cortisol": 0.22,
    "melatonin": 0.10, "adrenaline": 0.25, "parasympathetic": 0.50,
    "endorphin": 0.45, "noradrenaline": 0.35, "vasopressin": 0.30,
    "osmolality": 0.35, "blood_volume": 0.85, "angiotensin": 0.10,
    "fluid_queue": 0.0, "glucose": 0.55, "leptin": 0.45,
    "crh": 0.15, "acth": 0.15, "cytokines": 0.05, "fever": 0.02,
    "pain": 0.0, "anger": 0.05, "resentment": 0.02,
    "updated_at": 0,
}


def _vitals_table(db: Session) -> None:
    db.execute(text("CREATE TABLE IF NOT EXISTS pet_vitals (k VARCHAR(32) PRIMARY KEY, v TEXT)"))
    db.commit()


def _load(db: Session) -> dict:
    _vitals_table(db)
    row = db.execute(text("SELECT v FROM pet_vitals WHERE k='state'")).fetchone()
    st = dict(DEFAULTS)
    if row:
        try:
            st.update(json.loads(row[0]))
        except Exception:
            pass
    return st


def _save(db: Session, st: dict) -> None:
    st["updated_at"] = time.time()
    db.execute(text(
        "INSERT INTO pet_vitals(k, v) VALUES('state', :v) "
        "ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v"), {"v": json.dumps(st)})
    db.commit()


def _night_level(hour: int) -> float:
    if hour >= 23 or hour < 7:
        return 1.0
    if hour < 9:
        return 0.6
    if hour >= 20:
        return 0.7
    return 0.0


def _drift(st: dict) -> dict:
    now = time.time()
    last = st.get("updated_at") or now
    hours = max(0.0, min(24.0, (now - last) / 3600.0))
    if hours <= 0.001:
        return st
    lt = time.localtime(now)
    hour = lt.tm_hour
    night = _night_level(hour)

    # —— 腺苷（5.9）：睡着降，醒着涨 ——
    awake = 7 <= hour < 23
    st["adenosine"] = clamp(st["adenosine"] + (0.042 if awake else -0.22) * hours)

    # —— 褪黑素（5.6）：按时段基线回归 ——
    na_base = {0: .22, 5: .22, 6: .45, 9: .72, 12: .55, 14: .70, 18: .60, 22: .35}
    base = 0.22 if hour < 6 else (0.45 if hour < 9 else (0.72 if hour < 12 else (0.55 if hour < 14 else (0.70 if hour < 18 else (0.60 if hour < 22 else 0.35)))))
    st["melatonin"] = follow(st["melatonin"], base, 0.5, hours)

    # —— 饥饿（5.7）：越饿越慢 ——
    rate = 0.045 * max(0.25, 1 - 0.75 * st["hunger"])
    st["hunger"] = clamp(st["hunger"] + hours * rate)

    # —— 水循环（5.8）：累积量，不是回归 ——
    metabolic_rate = clamp(0.6 + 0.8 * max(0.0, st["adenosine"] - 0.3) + 0.4 * max(0.0, st["adrenaline"] - 0.5))
    loss = hours * 0.018 * clamp(metabolic_rate, 0.75, 1.7)
    st["osmolality"] = clamp(st["osmolality"] + loss * 0.55)
    st["blood_volume"] = clamp(st["blood_volume"] - loss * 0.40)
    st["angiotensin"] = follow(st["angiotensin"],
                               clamp(0.10 + 0.85 * max(0.0, (0.85 - st["blood_volume"]) / 0.45)), 0.4, hours)
    st["thirst"] = clamp(st["thirst"] + loss * 0.60 + 0.05 * max(0.0, st["angiotensin"] - 0.35))

    # —— HPA 轴（5.2，慢）——
    low_glucose = clamp((0.55 - st["glucose"]) / 0.35)
    high_hunger = clamp((st["hunger"] - 0.55) / 0.45)
    load = clamp(0.55 * st["cortisol"] + 0.25 * low_glucose + 0.20 * high_hunger)
    feedback = 1 - 0.70 * clamp((st["cortisol"] - 0.55) / 0.45)
    st["crh"] = follow(st["crh"], clamp(load * feedback), 0.15, hours)
    st["acth"] = follow(st["acth"], clamp(st["crh"] * 0.95), 0.35, hours)
    buffer = 1 - 0.35 * clamp((st["oxytocin"] - 0.40) / 0.60)
    st["cortisol"] = follow(st["cortisol"], clamp(0.15 + 0.80 * st["acth"]) * buffer, 1.20, hours)

    # —— 交感（5.3）——
    st["adrenaline"] = follow(st["adrenaline"], clamp(0.05 + 0.85 * load), 0.06, hours)
    leptin = st["leptin"]
    para_target = clamp(0.22 + 0.35 * (1 - st["adrenaline"]) + 0.22 * leptin + 0.18 * night)
    st["parasympathetic"] = follow(st["parasympathetic"], para_target, 0.9, hours)

    # —— 奖赏双系统（5.4）——
    want = clamp(0.70 * st["dopamine"] + 0.30 * st["oxytocin"] - 0.25 * st["cortisol"])
    st["endorphin"] = follow(st["endorphin"], clamp(0.20 + 0.65 * want), 0.80, hours)

    # —— 免疫（36 小时半衰）——
    st["immune"] = follow(st["immune"], 0.85, 36.0, hours)
    st["fever"] = follow(st["fever"], clamp(st["cytokines"] * 0.85), 1.0, hours)
    st["pain"] *= 0.5 ** (min(24.0, hours) / 0.5)

    # —— 血糖缓慢回归 ——
    st["glucose"] = follow(st["glucose"], 0.55, 1.5, hours)
    st["leptin"] = follow(st["leptin"], clamp(0.35 + 0.5 * (1 - st["hunger"])), 3.0, hours)

    st["updated_at"] = now
    return st


DRINK = ("水", "茶", "咖啡", "奶茶", "可乐", "果汁", "汽水", "汤", "酒")
DRINK_HINTS = ("喝", "来一", "灌", "一口")


def _is_drink(text: str) -> bool:
    return any(w in text for w in DRINK) and any(h in text for h in DRINK_HINTS)


def _react(st: dict, text: str) -> dict:
    t = text or ""
    if _is_drink(t):
        st["thirst"] = clamp(st["thirst"] - 0.55)
        st["osmolality"] = clamp(st["osmolality"] - 0.30)
        st["blood_volume"] = clamp(st["blood_volume"] + 0.18)
        st["angiotensin"] = clamp(st["angiotensin"] - 0.25)
        st["fluid_queue"] = clamp(st["fluid_queue"] + 0.55)
        st["dopamine"] = clamp(st["dopamine"] + 0.036)
        st["endorphin"] = clamp(st["endorphin"] + 0.030)
    if any(w in t for w in ("吃饭", "吃了", "投喂", "便当", "外卖")):
        st["hunger"] = clamp(st["hunger"] - 0.55)
        st["glucose"] = clamp(st["glucose"] + 0.25)
        st["leptin"] = clamp(st["leptin"] + 0.20)
        st["serotonin"] = clamp(st["serotonin"] + 0.05)
    if any(w in t for w in ("喜欢你", "宝宝", "可爱", "乖", "抱抱", "亲亲")):
        st["oxytocin"] = clamp(st["oxytocin"] + 0.07)
        st["dopamine"] = clamp(st["dopamine"] + 0.04)
        st["cortisol"] = clamp(st["cortisol"] - 0.05)
    if any(w in t for w in ("凶", "滚", "烦", "讨厌")):
        st["anger"] = clamp(st["anger"] + 0.35)
        st["resentment"] = clamp(st["resentment"] + 0.10)
        st["adrenaline"] = clamp(st["adrenaline"] + 0.15)
        st["serotonin"] = clamp(st["serotonin"] - 0.08)
    return st


def thirst_note(v: float) -> str:
    if v > 0.82: return "渴得厉害，嗓子发干，满脑子都是水"
    if v > 0.62: return "有点渴，想喝点凉的"
    if v > 0.45: return "嗓子有点干，想喝口水"
    if v > 0.30: return "嘴里有点干，不严重"
    if v < 0.25: return "刚喝过水，嘴里还润着"
    return ""


def _derive(st: dict) -> dict:
    energy = clamp(1 - st["adenosine"] * 0.65 - st["hunger"] * 0.25 - st["thirst"] * 0.20)
    mood = clamp(st["serotonin"] * 0.42 + st["dopamine"] * 0.28 + st["oxytocin"] * 0.20 - st["cortisol"] * 0.42 - st["anger"] * 0.25)
    arousal = clamp(st["adrenaline"] * 0.55 + st["cortisol"] * 0.30 + st["noradrenaline"] * 0.15)
    calm = clamp(st["parasympathetic"] * 0.70 + (1 - st["cortisol"]) * 0.30)
    attachment = clamp(st["oxytocin"] * 0.72 + st["vasopressin"] * 0.18 + st["serotonin"] * 0.10)
    stress = clamp(st["cortisol"] * 0.55 + st["adrenaline"] * 0.30 + st["crh"] * 0.15)
    return {
        "energy": energy, "mood": mood, "arousal": arousal, "calm": calm,
        "attachment": attachment, "stress": stress,
        "label_mood": ("心情不错" if mood > .7 else "平静" if mood > .5 else "有点低" if mood > .3 else "低落"),
        "label_thirst": thirst_note(st["thirst"]) or "不渴",
        "label_hunger": ("饱饱的" if st["hunger"] < .3 else "还行" if st["hunger"] < .55 else "有点饿" if st["hunger"] < .78 else "饿了"),
        "label_sleep": ("撑不住了" if st["adenosine"] > .7 else "犯困" if st["adenosine"] > .5 else "精神" if st["adenosine"] > .25 else "很精神"),
    }


@router.get("/life/vitals", summary="生命状态 · 只读直出")
def life_vitals(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    try:
        return _vitals_payload(db)
    except Exception as exc:
        import traceback
        return {"error": type(exc).__name__, "detail": str(exc)[:300],
                "trace": traceback.format_exc()[-600:]}


def _vitals_payload(db: Session) -> dict:
    st = _drift(_load(db))
    _save(db, st)
    d = _derive(st)
    bars = [
        ("hunger", "饥饿"), ("thirst", "口渴"), ("adenosine", "腺苷(困意)"), ("immune", "免疫"),
        ("dopamine", "多巴胺"), ("serotonin", "血清素"), ("oxytocin", "催产素"), ("cortisol", "皮质醇"),
        ("melatonin", "褪黑素"), ("adrenaline", "肾上腺素"), ("parasympathetic", "副交感"), ("endorphin", "内啡肽"),
    ]
    return {
        "state": {k: round(st[k], 3) for k, _ in bars},
        "bars": [{"key": k, "name": n, "v": round(st[k], 3)} for k, n in bars],
        "derived": {k: round(v, 3) for k, v in d.items() if isinstance(v, float)},
        "labels": {k: v for k, v in d.items() if k.startswith("label_")},
        "thirst_note": thirst_note(st["thirst"]),
        "updated_at": st["updated_at"],
    }


class ReactIn(BaseModel):
    text: str


@router.post("/life/react", summary="生命状态 · 对一句话反应")
def life_react(payload: ReactIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    st = _drift(_load(db))
    st = _react(st, payload.text)
    _save(db, st)
    return {"ok": True, "thirst": round(st["thirst"], 3), "note": thirst_note(st["thirst"])}
