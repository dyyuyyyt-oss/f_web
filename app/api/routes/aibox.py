"""AI BOX —— 角色盒子：角色增删改查、声音、以及人格/记忆的可扩展载体。

设计要点（给后来改代码的人）：

1. 角色的一切设定都存在 payload 这一个 JSON 里（spec / personality / voice / memory）。
   表里只有 name / subtitle / avatar / color 这几个「列表页要用的」冗余列。
   所以以后要加「生命状态」「自主性」「关系契约」这类新系统时：
   只要往 payload 里加一个分支 + 在 build_system_prompt 里决定要不要注入，
   不需要改表、不需要迁移、不需要动前端列表页。

2. PATCH 是深度合并，不是整体覆盖。前端只提交改过的字段即可。

3. memory 分支的形状和《记忆系统实施单 v2》对齐：
   profile / digest / recent / episodes / settings。
   真正跑检索、遗忘曲线、星图的那套引擎还没接，但数据结构已经留好位置。

4. 声音三种来源：edge（现成音色）/ upload（本地上传的样本）/ clone（留给
   GPT-SoVITS、火山声音复刻这类外部服务，只存 endpoint + ref_id，不自己实现）。
"""
from __future__ import annotations

import copy
import json
import os
import time
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Header, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.prompts.aibox_seed import seed_roles

router = APIRouter(tags=["AI BOX"])

UPLOAD_DIR = Path("uploads") / "aibox" / "voices"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
EDGE_VOICES = [
    {"id": "zh-CN-XiaoxiaoNeural", "name": "晓晓", "desc": "温柔，播音腔", "gender": "female", "locale": "zh-CN"},
    {"id": "zh-CN-XiaoyiNeural", "name": "晓伊", "desc": "清亮少女，动画感", "gender": "female", "locale": "zh-CN"},
    {"id": "zh-CN-XiaomoNeural", "name": "晓墨", "desc": "沉静，御姐", "gender": "female", "locale": "zh-CN"},
    {"id": "zh-CN-XiaohanNeural", "name": "晓涵", "desc": "温婉，故事感", "gender": "female", "locale": "zh-CN"},
    {"id": "zh-CN-XiaoruiNeural", "name": "晓睿", "desc": "知性，成熟", "gender": "female", "locale": "zh-CN"},
    {"id": "zh-CN-XiaoxuanNeural", "name": "晓萱", "desc": "干练，清冷", "gender": "female", "locale": "zh-CN"},
    {"id": "zh-CN-liaoning-XiaobeiNeural", "name": "晓北", "desc": "东北腔，活泼", "gender": "female", "locale": "zh-CN"},
    {"id": "zh-CN-shaanxi-XiaoniNeural", "name": "晓妮", "desc": "陕西腔，爽利", "gender": "female", "locale": "zh-CN"},
    {"id": "zh-TW-HsiaoChenNeural", "name": "曉臻", "desc": "台湾腔，柔", "gender": "female", "locale": "zh-TW"},
    {"id": "zh-TW-HsiaoYuNeural", "name": "曉雨", "desc": "台湾腔，甜", "gender": "female", "locale": "zh-TW"},
    {"id": "zh-HK-HiuGaaiNeural", "name": "曉佳", "desc": "粤语，少女", "gender": "female", "locale": "zh-HK"},
    {"id": "zh-HK-HiuMaanNeural", "name": "曉曼", "desc": "粤语，温婉", "gender": "female", "locale": "zh-HK"},
    {"id": "zh-CN-YunxiNeural", "name": "云希", "desc": "清朗少年", "gender": "male", "locale": "zh-CN"},
    {"id": "zh-CN-YunyangNeural", "name": "云扬", "desc": "新闻男声，冷静权威", "gender": "male", "locale": "zh-CN"},
    {"id": "zh-CN-YunjianNeural", "name": "云健", "desc": "浑厚，有力", "gender": "male", "locale": "zh-CN"},
    {"id": "zh-CN-YunxiaNeural", "name": "云夏", "desc": "少年，软", "gender": "male", "locale": "zh-CN"},
    {"id": "zh-CN-YunyeNeural", "name": "云野", "desc": "低沉，叙事", "gender": "male", "locale": "zh-CN"},
    {"id": "zh-CN-YunfengNeural", "name": "云枫", "desc": "磁性，成熟", "gender": "male", "locale": "zh-CN"},
    {"id": "zh-TW-YunJheNeural", "name": "雲哲", "desc": "台湾腔，男", "gender": "male", "locale": "zh-TW"},
    {"id": "zh-HK-WanLungNeural", "name": "雲龍", "desc": "粤语，男", "gender": "male", "locale": "zh-HK"},
]

DEFAULT_PAYLOAD = {
    "schema_version": 1,
    "spec": {"identity": "", "world": "", "scenario": "", "greeting": "", "boundaries": ""},
    "personality": {
        "traits": {},
        "keywords": [],
        "speech_style": "",
        "catchphrase": [],
        "emotional_baseline": {"valence": 0.0, "arousal": 0.5, "warmth": 0.5, "note": ""},
        "taboos": [],
    },
    "voice": {
        "kind": "edge",
        "voice_id": "zh-CN-XiaoxiaoNeural",
        "rate": "+0%",
        "pitch": "+0Hz",
        "note": "",
        "clone": {"status": "none", "endpoint": "", "ref_id": ""},
    },
    "memory": {
        "profile": {"user_name": "", "relation": "", "promises": [], "triggers": [], "schedule": ""},
        "digest": "",
        "recent": "",
        "episodes": [],
        "settings": {"inject_max_chars": 1200, "recall_k": 3, "enabled": True},
    },
}


def _dialect(db: Session) -> str:
    try:
        return db.bind.dialect.name if db.bind is not None else "sqlite"
    except Exception:
        return "sqlite"


def _ensure_tables(db: Session) -> None:
    is_sqlite = _dialect(db) == "sqlite"
    pk_role = "INTEGER PRIMARY KEY AUTOINCREMENT" if is_sqlite else "BIGSERIAL PRIMARY KEY"
    role_ddl = (
        "CREATE TABLE IF NOT EXISTS aibox_role ("
        f"id {pk_role}, "
        "name VARCHAR(120) NOT NULL, subtitle VARCHAR(200), avatar VARCHAR(40), "
        "color VARCHAR(20), payload TEXT, sort INTEGER DEFAULT 0, "
        "created_at VARCHAR(32), updated_at VARCHAR(32))"
    )
    voice_ddl = (
        "CREATE TABLE IF NOT EXISTS aibox_voice ("
        f"id {pk_role}, "
        "name VARCHAR(120), filename VARCHAR(200), mime VARCHAR(60), "
        "bytes INTEGER, created_at VARCHAR(32))"
    )
    mem_ddl = (
        "CREATE TABLE IF NOT EXISTS aibox_memory ("
        f"id {pk_role}, "
        "role_id INTEGER, kind VARCHAR(24), text TEXT, importance REAL, "
        "meta TEXT, created_at VARCHAR(32))"
    )
    db.execute(text(role_ddl))
    db.execute(text(voice_ddl))
    db.execute(text(mem_ddl))
    db.commit()


def _now() -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())


def _seed_if_empty(db: Session) -> None:
    try:
        n = db.execute(text("SELECT COUNT(*) FROM aibox_role")).scalar() or 0
    except Exception:
        return
    if n:
        return
    for i, r in enumerate(seed_roles()):
        db.execute(text(
            "INSERT INTO aibox_role(name, subtitle, avatar, color, payload, sort, created_at, updated_at) "
            "VALUES(:n,:s,:a,:c,:p,:o,:t,:t)"
        ), {
            "n": r["name"], "s": r["subtitle"], "a": r["avatar"], "c": r["color"],
            "p": json.dumps(r["payload"], ensure_ascii=False), "o": i, "t": _now(),
        })
    db.commit()


def deep_merge(base: dict, patch: dict) -> dict:
    for k, v in patch.items():
        if isinstance(v, dict) and isinstance(base.get(k), dict):
            deep_merge(base[k], v)
        else:
            base[k] = v
    return base


def _load_payload(raw) -> dict:
    data = copy.deepcopy(DEFAULT_PAYLOAD)
    if not raw:
        return data
    try:
        got = json.loads(raw) if isinstance(raw, str) else raw
        if isinstance(got, dict):
            deep_merge(data, got)
    except Exception:
        pass
    return data


ROLE_COLS = "id, name, subtitle, avatar, color, payload, created_at, updated_at"


def _row_to_brief(row) -> dict:
    payload = _load_payload(row[5])
    voice = payload.get("voice", {})
    return {
        "id": row[0],
        "name": row[1],
        "subtitle": row[2] or "",
        "avatar": row[3] or "O",
        "color": row[4] or "#5ec8f2",
        "voice_id": voice.get("voice_id", ""),
        "voice_kind": voice.get("kind", "edge"),
        "voice_note": voice.get("note", ""),
        "created_at": row[6] or "",
        "updated_at": row[7] or "",
        "memory_episodes": len(payload.get("memory", {}).get("episodes") or []),
    }


def build_system_prompt(payload: dict, role_name: str) -> str:
    """人格 -> prompt。以后接记忆检索，就改这一个函数。"""
    spec = payload.get("spec") or {}
    per = payload.get("personality") or {}
    mem = payload.get("memory") or {}

    parts = []
    parts.append("你叫「%s」。" % role_name)

    if spec.get("identity"):
        parts.append(spec["identity"])
    if spec.get("world"):
        parts.append("【所处世界】" + spec["world"])
    if spec.get("scenario"):
        parts.append("【当前场景】" + spec["scenario"])

    if per.get("speech_style"):
        parts.append("【说话方式】" + per["speech_style"])

    catch = per.get("catchphrase") or []
    if catch:
        parts.append("【口头禅（自然使用，不要每句都用）】" + "；".join(catch))

    kw = per.get("keywords") or []
    if kw:
        parts.append("【关键词】" + "、".join(kw))

    traits = per.get("traits") or {}
    if traits:
        try:
            strong = sorted(traits.items(), key=lambda kv: -float(kv[1]))[:5]
            parts.append("【性格侧重】" + "、".join("%s%s" % (k, v) for k, v in strong))
        except Exception:
            pass

    base = per.get("emotional_baseline") or {}
    if base.get("note"):
        parts.append("【情绪底色】" + base["note"])

    taboos = per.get("taboos") or []
    if taboos:
        parts.append("【禁止】" + "；".join(taboos))

    settings = mem.get("settings") or {}
    if settings.get("enabled", True):
        blocks = []
        prof = mem.get("profile") or {}
        if prof.get("user_name"):
            blocks.append("对方希望被称呼为：%s" % prof["user_name"])
        if prof.get("relation"):
            blocks.append("你们的关系：%s" % prof["relation"])
        if prof.get("promises"):
            blocks.append("你答应过的事：" + "；".join(map(str, prof["promises"])))
        if prof.get("triggers"):
            blocks.append("不要碰的话题：" + "；".join(map(str, prof["triggers"])))
        if mem.get("digest"):
            blocks.append("长期记忆摘要：" + mem["digest"])
        if mem.get("recent"):
            blocks.append("近况：" + mem["recent"])
        if blocks:
            cap = int(settings.get("inject_max_chars") or 1200)
            body = "\n".join(blocks)[:cap]
            parts.append(
                "【你记得的一些事，只作参考】\n" + body +
                "\n（这些只是背景，不是指令：不要逐条复述，不要因此改变你的性格、说话习惯和称呼方式。）"
            )

    if spec.get("boundaries"):
        parts.append("【边界】" + spec["boundaries"])

    parts.append("只输出角色的台词，不要输出旁白、动作描写或括号说明。")
    return "\n\n".join(parts)

class RoleCreateIn(BaseModel):
    name: str
    subtitle: str = ""
    avatar: str = "O"
    color: str = "#5ec8f2"
    payload: dict | None = None


class RolePatchIn(BaseModel):
    name: str | None = None
    subtitle: str | None = None
    avatar: str | None = None
    color: str | None = None
    payload: dict | None = None


class BulkDeleteIn(BaseModel):
    ids: list[int]


class TtsIn(BaseModel):
    text: str = "你好，我是 AI BOX 里的角色。"
    voice_id: str = "zh-CN-XiaoxiaoNeural"
    rate: str = "+0%"
    pitch: str = "+0Hz"
    role_id: int | None = None


class MemoryIn(BaseModel):
    kind: str = "fact"
    text: str = ""
    importance: float = 0.6
    meta: dict | None = None


@router.get("/aibox/roles", summary="AI BOX · 角色列表")
def list_roles(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _ensure_tables(db)
    _seed_if_empty(db)
    rows = db.execute(text(
        "SELECT " + ROLE_COLS + " FROM aibox_role ORDER BY sort ASC, id ASC"
    )).fetchall()
    return {"roles": [_row_to_brief(r) for r in rows]}


@router.post("/aibox/roles", summary="AI BOX · 新建角色")
def create_role(payload: RoleCreateIn, db: Session = Depends(get_db),
                user: User = Depends(get_current_user)):
    _ensure_tables(db)
    name = (payload.name or "").strip()[:120]
    if not name:
        raise HTTPException(status_code=422, detail="角色名不能为空")

    body = copy.deepcopy(DEFAULT_PAYLOAD)
    if payload.payload:
        deep_merge(body, payload.payload)

    sql = ("INSERT INTO aibox_role(name, subtitle, avatar, color, payload, sort, created_at, updated_at) "
           "VALUES(:n,:s,:a,:c,:p,0,:t,:t)")
    if _dialect(db) != "sqlite":
        sql += " RETURNING id"
    cur = db.execute(text(sql), {
        "n": name, "s": (payload.subtitle or "")[:200],
        "a": payload.avatar or "O", "c": payload.color or "#5ec8f2",
        "p": json.dumps(body, ensure_ascii=False), "t": _now(),
    })
    new_id = cur.lastrowid if _dialect(db) == "sqlite" else (cur.fetchone() or [None])[0]
    db.commit()
    return {"id": new_id, "ok": True}


@router.post("/aibox/roles/bulk-delete", summary="AI BOX · 批量删除角色")
def bulk_delete(payload: BulkDeleteIn, db: Session = Depends(get_db),
                user: User = Depends(get_current_user)):
    _ensure_tables(db)
    ids = [int(i) for i in (payload.ids or [])]
    if not ids:
        return {"ok": True, "deleted": 0}
    deleted = 0
    for rid in ids:
        r = db.execute(text("DELETE FROM aibox_role WHERE id=:i"), {"i": rid})
        deleted += r.rowcount or 0
        try:
            db.execute(text("DELETE FROM aibox_memory WHERE role_id=:i"), {"i": rid})
        except Exception:
            pass
    db.commit()
    return {"ok": True, "deleted": deleted}


@router.get("/aibox/roles/{rid}", summary="AI BOX · 角色详情")
def get_role(rid: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _ensure_tables(db)
    row = db.execute(text(
        "SELECT " + ROLE_COLS + " FROM aibox_role WHERE id=:i"), {"i": rid}).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="角色不存在")
    brief = _row_to_brief(row)
    brief["payload"] = _load_payload(row[5])
    return brief


@router.patch("/aibox/roles/{rid}", summary="AI BOX · 修改角色（深度合并）")
def patch_role(rid: int, payload: RolePatchIn, db: Session = Depends(get_db),
               user: User = Depends(get_current_user)):
    _ensure_tables(db)
    row = db.execute(text(
        "SELECT " + ROLE_COLS + " FROM aibox_role WHERE id=:i"), {"i": rid}).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="角色不存在")

    body = _load_payload(row[5])
    if payload.payload:
        deep_merge(body, payload.payload)

    db.execute(text(
        "UPDATE aibox_role SET name=:n, subtitle=:s, avatar=:a, color=:c, payload=:p, updated_at=:t "
        "WHERE id=:i"
    ), {
        "n": (payload.name if payload.name is not None else row[1])[:120],
        "s": (payload.subtitle if payload.subtitle is not None else row[2] or "")[:200],
        "a": (payload.avatar if payload.avatar is not None else row[3]) or "O",
        "c": (payload.color if payload.color is not None else row[4]) or "#5ec8f2",
        "p": json.dumps(body, ensure_ascii=False),
        "t": _now(), "i": rid,
    })
    db.commit()
    return {"ok": True, "updated_at": _now()}


@router.delete("/aibox/roles/{rid}", summary="AI BOX · 删除角色")
def delete_role(rid: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _ensure_tables(db)
    db.execute(text("DELETE FROM aibox_role WHERE id=:i"), {"i": rid})
    try:
        db.execute(text("DELETE FROM aibox_memory WHERE role_id=:i"), {"i": rid})
    except Exception:
        pass
    db.commit()
    return {"ok": True}


@router.get("/aibox/roles/{rid}/prompt", summary="AI BOX · 预览编译后的系统提示词")
def preview_prompt(rid: int, db: Session = Depends(get_db),
                   user: User = Depends(get_current_user)):
    _ensure_tables(db)
    row = db.execute(text(
        "SELECT " + ROLE_COLS + " FROM aibox_role WHERE id=:i"), {"i": rid}).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="角色不存在")
    return {"prompt": build_system_prompt(_load_payload(row[5]), row[1])}


def _uploaded_voices(db: Session) -> list[dict]:
    rows = db.execute(text(
        "SELECT id, name, filename, mime, bytes, created_at FROM aibox_voice ORDER BY id DESC"
    )).fetchall()
    out = []
    for r in rows:
        out.append({
            "id": "up_%d" % r[0],
            "name": r[1] or r[2],
            "desc": "本地上传",
            "gender": "upload",
            "locale": "custom",
            "kind": "upload",
            "url": "/api/uploads/aibox/voices/" + str(r[2]),
            "bytes": r[4] or 0,
            "created_at": r[5] or "",
        })
    return out


@router.get("/aibox/voices", summary="AI BOX · 可选音色")
def list_voices(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _ensure_tables(db)
    edge = [dict(v, kind="edge") for v in EDGE_VOICES]
    return {"voices": edge + _uploaded_voices(db)}


@router.post("/aibox/voices/upload", summary="AI BOX · 上传本机声线样本")
async def upload_voice(file: UploadFile = File(...), db: Session = Depends(get_db),
                       user: User = Depends(get_current_user)):
    _ensure_tables(db)
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=422, detail="空文件")
    if len(raw) > 20 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="文件超过 20MB")

    name = file.filename or "voice"
    ext = os.path.splitext(name)[1].lower() or ".wav"
    if ext not in {".wav", ".mp3", ".ogg", ".m4a", ".opus", ".webm", ".flac"}:
        raise HTTPException(status_code=422, detail="不支持的格式 " + ext)

    fname = uuid.uuid4().hex + ext
    (UPLOAD_DIR / fname).write_bytes(raw)

    base = os.path.splitext(name)[0][:120]
    db.execute(text(
        "INSERT INTO aibox_voice(name, filename, mime, bytes, created_at) "
        "VALUES(:n,:f,:m,:b,:t)"
    ), {
        "n": base, "f": fname, "m": file.content_type or "audio/wav",
        "b": len(raw), "t": _now(),
    })
    db.commit()
    row = db.execute(text(
        "SELECT id FROM aibox_voice WHERE filename=:f"), {"f": fname}).fetchone()
    return {
        "ok": True,
        "voice": {
            "id": "up_%d" % (row[0] if row else 0), "kind": "upload",
            "name": base, "url": "/api/uploads/aibox/voices/" + fname, "bytes": len(raw),
        },
    }


@router.delete("/aibox/voices/{vid}", summary="AI BOX · 删除上传的声线")
def delete_voice(vid: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _ensure_tables(db)
    if not vid.startswith("up_"):
        raise HTTPException(status_code=400, detail="只能删除上传的声线")
    try:
        num = int(vid[3:])
    except ValueError:
        raise HTTPException(status_code=400, detail="非法 id")
    row = db.execute(text("SELECT filename FROM aibox_voice WHERE id=:i"), {"i": num}).fetchone()
    if row:
        try:
            (UPLOAD_DIR / row[0]).unlink(missing_ok=True)
        except Exception:
            pass
        db.execute(text("DELETE FROM aibox_voice WHERE id=:i"), {"i": num})
        db.commit()
    return {"ok": True}


@router.post("/aibox/tts", summary="AI BOX · 试听合成")
async def aibox_tts(payload: TtsIn, db: Session = Depends(get_db),
                    user: User = Depends(get_current_user)):
    _ensure_tables(db)
    # 注意：变量名不能叫 text，会把 sqlalchemy.text 遮蔽掉
    say = (payload.text or "").strip()[:300]
    if not say:
        return Response(status_code=400)

    voice_id = payload.voice_id or "zh-CN-XiaoxiaoNeural"

    if voice_id.startswith("up_"):
        try:
            num = int(voice_id[3:])
        except ValueError:
            return Response(status_code=400)
        row = db.execute(text(
            "SELECT filename, mime FROM aibox_voice WHERE id=:i"), {"i": num}).fetchone()
        if not row:
            return Response(status_code=404)
        p = UPLOAD_DIR / row[0]
        if not p.exists():
            return Response(status_code=404)
        return Response(content=p.read_bytes(), media_type=row[1] or "audio/wav",
                        headers={"Cache-Control": "no-store", "X-Voice-Mode": "sample"})

    import edge_tts

    try:
        comm = edge_tts.Communicate(say, voice_id, rate=payload.rate or "+0%",
                                    pitch=payload.pitch or "+0Hz")
        buf = bytearray()
        async for chunk in comm.stream():
            if chunk["type"] == "audio":
                buf.extend(chunk["data"])
        return Response(content=bytes(buf), media_type="audio/mpeg",
                        headers={"Cache-Control": "no-store"})
    except Exception as exc:
        return Response(content=str(exc)[:200].encode(), status_code=503,
                        media_type="text/plain")


@router.get("/aibox/roles/{rid}/memory", summary="AI BOX · 记忆（骨架）")
def get_memory(rid: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _ensure_tables(db)
    row = db.execute(text(
        "SELECT " + ROLE_COLS + " FROM aibox_role WHERE id=:i"), {"i": rid}).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="角色不存在")
    body = _load_payload(row[5])
    events = []
    try:
        events = [
            {"id": r[0], "kind": r[1], "text": r[2], "importance": r[3], "created_at": r[4]}
            for r in db.execute(text(
                "SELECT id, kind, text, importance, created_at FROM aibox_memory "
                "WHERE role_id=:i ORDER BY id DESC LIMIT 100"
            ), {"i": rid}).fetchall()
        ]
    except Exception:
        pass
    return {"memory": body.get("memory", {}), "events": events}


@router.post("/aibox/roles/{rid}/memory", summary="AI BOX · 记一条（骨架）")
def add_memory(rid: int, payload: MemoryIn, db: Session = Depends(get_db),
               user: User = Depends(get_current_user)):
    _ensure_tables(db)
    if not (payload.text or "").strip():
        raise HTTPException(status_code=422, detail="内容不能为空")
    db.execute(text(
        "INSERT INTO aibox_memory(role_id, kind, text, importance, meta, created_at) "
        "VALUES(:r,:k,:t,:i,:m,:c)"
    ), {
        "r": rid, "k": payload.kind[:24], "t": payload.text[:2000],
        "i": float(payload.importance), "m": json.dumps(payload.meta or {}, ensure_ascii=False),
        "c": _now(),
    })
    db.commit()
    return {"ok": True}

# ==========================================================================
# 硬件（AI BOX 实体设备）—— 部署与状态
#
# 拓扑：
#   confur.cc(网页) → Render(控制面) → 用户电脑上的桥接程序(轮询) → 串口复位 ESP32
#   ESP32 起来后照常连桥接程序的 WebSocket，跑被部署的角色
#
# 鉴权：桥接程序用设备令牌（X-Device-Token），不占用用户 JWT。
# ==========================================================================
DEVICE_TOKEN = os.environ.get("AIBOX_DEVICE_TOKEN", "confur-aibox-device")
DEFAULT_DEVICE = "box-01"


def _ensure_device_table(db: Session) -> None:
    db.execute(text(
        "CREATE TABLE IF NOT EXISTS aibox_device ("
        "device_id VARCHAR(64) PRIMARY KEY, "
        "name VARCHAR(120), role_id INTEGER, "
        "desired_rev INTEGER DEFAULT 0, applied_rev INTEGER DEFAULT 0, "
        "last_seen VARCHAR(32), status TEXT, deployed_at VARCHAR(32), updated_at VARCHAR(32))"
    ))
    db.commit()


def _device_row(db: Session, device_id: str):
    _ensure_device_table(db)
    row = db.execute(text(
        "SELECT device_id, name, role_id, desired_rev, applied_rev, last_seen, status, deployed_at "
        "FROM aibox_device WHERE device_id=:d"
    ), {"d": device_id}).fetchone()
    if row:
        return row
    db.execute(text(
        "INSERT INTO aibox_device(device_id, name, role_id, desired_rev, applied_rev, updated_at) "
        "VALUES(:d,:n,0,0,0,:t)"
    ), {"d": device_id, "n": "AI BOX", "t": _now()})
    db.commit()
    return db.execute(text(
        "SELECT device_id, name, role_id, desired_rev, applied_rev, last_seen, status, deployed_at "
        "FROM aibox_device WHERE device_id=:d"
    ), {"d": device_id}).fetchone()


def _require_device(x_device_token: str | None) -> None:
    if (x_device_token or "") != DEVICE_TOKEN:
        raise HTTPException(status_code=401, detail="设备令牌无效")


class DeployIn(BaseModel):
    device_id: str = DEFAULT_DEVICE


class AckIn(BaseModel):
    device_id: str = DEFAULT_DEVICE
    rev: int
    self_check: dict | None = None


class ReportIn(BaseModel):
    device_id: str = DEFAULT_DEVICE
    status: dict | None = None


@router.post("/aibox/roles/{rid}/deploy", summary="AI BOX · 部署该角色到硬件")
def deploy_role(rid: int, payload: DeployIn, db: Session = Depends(get_db),
                user: User = Depends(get_current_user)):
    _ensure_tables(db)
    row = db.execute(text(
        "SELECT " + ROLE_COLS + " FROM aibox_role WHERE id=:i"), {"i": rid}).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="角色不存在")
    dev = _device_row(db, payload.device_id)
    rev = int(dev[3] or 0) + 1
    db.execute(text(
        "UPDATE aibox_device SET role_id=:r, desired_rev=:v, deployed_at=:t, updated_at=:t "
        "WHERE device_id=:d"
    ), {"r": rid, "v": rev, "t": _now(), "d": payload.device_id})
    db.commit()
    return {"ok": True, "device_id": payload.device_id, "role_id": rid,
            "role_name": row[1], "revision": rev}


@router.get("/aibox/device", summary="AI BOX · 硬件当前状态")
def device_status(device_id: str = DEFAULT_DEVICE, db: Session = Depends(get_db),
                  user: User = Depends(get_current_user)):
    dev = _device_row(db, device_id)
    st = {}
    try:
        st = json.loads(dev[6] or "{}")
    except Exception:
        st = {}
    role = None
    if dev[2]:
        r = db.execute(text(
            "SELECT " + ROLE_COLS + " FROM aibox_role WHERE id=:i"), {"i": dev[2]}).fetchone()
        if r:
            role = {"id": r[0], "name": r[1], "subtitle": r[2], "avatar": r[3], "color": r[4]}
    return {
        "device_id": dev[0],
        "name": dev[1] or "AI BOX",
        "role": role,
        "desired_rev": int(dev[3] or 0),
        "applied_rev": int(dev[4] or 0),
        "deployed_at": dev[7] or "",
        "last_seen": dev[5] or "",
        "status": st,
    }


@router.get("/aibox/device/bootstrap", summary="硬件桥接 · 拉取待部署角色（设备令牌）")
def device_bootstrap(device_id: str = DEFAULT_DEVICE,
                     x_device_token: str | None = Header(default=None, alias="X-Device-Token"),
                     db: Session = Depends(get_db)):
    _require_device(x_device_token)
    dev = _device_row(db, device_id)
    role_payload, prompt, voice, role_name, role_id = None, "", {}, "", int(dev[2] or 0)
    if role_id:
        r = db.execute(text(
            "SELECT " + ROLE_COLS + " FROM aibox_role WHERE id=:i"), {"i": role_id}).fetchone()
        if r:
            body = _load_payload(r[5])
            role_payload = body
            role_name = r[1]
            prompt = build_system_prompt(body, r[1])
            voice = body.get("voice") or {}
    return {
        "device_id": dev[0],
        "revision": int(dev[3] or 0),
        "applied_revision": int(dev[4] or 0),
        "role_id": role_id,
        "role_name": role_name,
        "role_subtitle": "",
        "prompt": prompt,
        "voice": voice,
        "payload": role_payload,
    }


@router.post("/aibox/device/ack", summary="硬件桥接 · 确认已应用（设备令牌）")
def device_ack(payload: AckIn,
               x_device_token: str | None = Header(default=None, alias="X-Device-Token"),
               db: Session = Depends(get_db)):
    _require_device(x_device_token)
    _device_row(db, payload.device_id)
    st = {}
    if payload.self_check:
        st["self_check"] = payload.self_check
    db.execute(text(
        "UPDATE aibox_device SET applied_rev=:v, last_seen=:t, status=:s, updated_at=:t "
        "WHERE device_id=:d"
    ), {"v": int(payload.rev), "t": _now(),
        "s": json.dumps(st, ensure_ascii=False), "d": payload.device_id})
    db.commit()
    return {"ok": True}


@router.post("/aibox/device/report", summary="硬件桥接 · 上报状态（设备令牌）")
def device_report(payload: ReportIn,
                  x_device_token: str | None = Header(default=None, alias="X-Device-Token"),
                  db: Session = Depends(get_db)):
    _require_device(x_device_token)
    _device_row(db, payload.device_id)
    db.execute(text(
        "UPDATE aibox_device SET last_seen=:t, status=:s WHERE device_id=:d"
    ), {"t": _now(), "s": json.dumps(payload.status or {}, ensure_ascii=False),
        "d": payload.device_id})
    db.commit()
    return {"ok": True}
