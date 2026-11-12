import asyncio
import time

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from app.api.routes import life


def _db():
    engine = create_engine("sqlite://")
    return engine, Session(engine)


def test_life_history_cursor_has_stable_fields_and_no_overlap():
    engine, db = _db()
    try:
        life._pet_chat_table(db)
        for content in ("one", "two", "three"):
            db.execute(text(
                "INSERT INTO pet_chat(role, content, created_at) VALUES('user', :content, '2026-01-01 00:00:00')"
            ), {"content": content})
        db.commit()

        latest = life.life_history(before_id=None, limit=2, db=db, user=None)
        older = life.life_history(before_id=latest["next_cursor"], limit=2, db=db, user=None)

        assert [item["content"] for item in latest["messages"]] == ["two", "three"]
        assert latest["has_more"] is True
        assert [item["content"] for item in older["messages"]] == ["one"]
        assert set(latest["messages"][0]) == {"id", "role", "content", "created_at", "status"}
        assert {item["id"] for item in latest["messages"]}.isdisjoint(
            {item["id"] for item in older["messages"]}
        )
    finally:
        db.close()
        engine.dispose()


def test_life_chat_replay_does_not_call_model_or_write_twice(monkeypatch):
    engine, db = _db()
    calls = []

    class FakeAIClient:
        def __init__(self, provider):
            pass

        async def chat(self, messages, **kwargs):
            calls.append(messages)
            return "你说杭州呀，我记着呢。"

    monkeypatch.setattr("app.services.ai_client.AIClient", FakeAIClient)
    monkeypatch.setattr(life, "_mem_search", lambda *_args, **_kwargs: [])
    monkeypatch.setattr(life, "_mem_write", lambda *_args, **_kwargs: {"ok": True})
    monkeypatch.setattr(life, "load_state", lambda: dict(life.DEFAULT_STATE))
    monkeypatch.setattr(life, "save_state", lambda _state: None)
    monkeypatch.setattr(life, "_load", lambda _db: {})
    monkeypatch.setattr(life, "_drift", lambda state: state)
    monkeypatch.setattr(life, "_react", lambda state, _text: state)
    monkeypatch.setattr(life, "_derive", lambda _state: {})
    monkeypatch.setattr(life, "_tags", lambda *_args: [])
    monkeypatch.setattr(life, "_note", lambda *_args: "")
    monkeypatch.setattr(life, "_save", lambda *_args: None)
    try:
        first = asyncio.run(life.life_chat(life.ChatIn(text="我明天去杭州", request_id="same-request"), db, None))
        replay = asyncio.run(life.life_chat(life.ChatIn(text="我明天去杭州", request_id="same-request"), db, None))
        asyncio.run(life.life_chat(life.ChatIn(text="那边需要带伞吗？", request_id="follow-up"), db, None))

        assert first["reply"] == replay["reply"]
        assert replay["replayed"] is True
        assert len(calls) == 2
        assert [item["role"] for item in calls[1]] == ["system", "user", "assistant", "user"]
        assert calls[1][1]["content"] == "我明天去杭州"
        assert calls[1][-1]["content"] == "那边需要带伞吗？"
        rows = db.execute(text("SELECT role, content FROM pet_chat ORDER BY id")).fetchall()
        assert [(row[0], row[1]) for row in rows] == [
            ("user", "我明天去杭州"), ("assistant", "你说杭州呀，我记着呢。"),
            ("user", "那边需要带伞吗？"), ("assistant", "你说杭州呀，我记着呢。"),
        ]
        assert rows[0][0] == "user"
    finally:
        db.close()
        engine.dispose()


def test_active_chat_request_is_not_processed_a_second_time(monkeypatch):
    engine, db = _db()
    monkeypatch.setattr("app.services.ai_client.AIClient", lambda **_kwargs: pytest.fail("model must not be called"))
    try:
        life._pet_chat_table(db)
        now = time.strftime("%Y-%m-%d %H:%M:%S")
        db.execute(text(
            "INSERT INTO pet_chat(role, content, created_at, request_id, request_state, request_updated_at) "
            "VALUES('user', 'pending', :now, 'active-request', 'processing', :now)"
        ), {"now": now})
        db.commit()

        with pytest.raises(HTTPException) as error:
            asyncio.run(life.life_chat(
                life.ChatIn(text="pending", request_id="active-request"), db, None
            ))
        assert error.value.status_code == 409
    finally:
        db.close()
        engine.dispose()


def test_memory_graph_uses_episode_and_edge_records():
    engine, db = _db()
    try:
        life._mem_tables(db)
        db.execute(text(
            "INSERT INTO pet_episodes(kind, text, importance, created_at, archived, superseded_by) "
            "VALUES('fact', '喜欢拿铁', 0.8, 1760000000, 0, NULL), "
            "('event', '昨天读书', 0.4, 1760000100, 0, NULL), "
            "('topic', '旧归档', 0.3, 1760000200, 1, NULL)"
        ))
        db.execute(text(
            "INSERT INTO pet_edges(a, b, w, rel, at) VALUES('2', '1', 0.7, 'similar', 1760000200)"
        ))
        db.commit()

        current = life.life_graph(q="咖啡", db=db, user=None)
        events = life.life_graph(kind="event", db=db, user=None)
        all_items = life.life_graph(include_archived=True, db=db, user=None)

        assert current["nodes"] == []
        assert current["stats"] == {"memories": 0, "episodes": 0, "days": 0, "relations": 0}
        assert len(all_items["nodes"]) == 3
        assert len(events["nodes"]) == 1
        assert events["nodes"][0]["kind"] == "event"
        assert all_items["stats"]["memories"] == 3
        assert all_items["stats"]["episodes"] == 1
        assert all_items["stats"]["relations"] == 1
        assert all_items["edges"][0]["a"] == "e2"
        assert all_items["edges"][0]["b"] == "e1"
        assert all_items["nodes"][0]["id"] == "e3"
    finally:
        db.close()
        engine.dispose()
