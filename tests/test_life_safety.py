"""Isolated regressions: no application startup, real DB or external AI calls."""
import json
from contextlib import closing
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.api.deps import get_current_user
from app.api.routes import admin, life
from app.db.session import get_db
from tools.backup_sqlite import backup_database


@pytest.fixture
def context():
    engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
    with Session(engine) as db:
        app = FastAPI()
        app.include_router(life.router, prefix='/api')
        app.include_router(admin.router, prefix='/api')
        app.dependency_overrides[get_db] = lambda: db
        with TestClient(app) as client:
            yield app, client, db
    engine.dispose()


def test_settings_requires_authentication(context):
    _, client, _ = context
    assert client.get('/api/life/pet-settings').status_code == 401


def test_settings_never_returns_secrets(context):
    app, client, db = context
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=1, role='user')
    life._pet_table(db)
    for key, value in [('embed_key', 'test-secret'), ('voice', 'test-voice'), ('memory_block', 'test-memory')]:
        db.execute(text('INSERT INTO pet_settings(k,v) VALUES(:k,:v)'), {'k': key, 'v': json.dumps(value)})
    db.commit()
    response = client.get('/api/life/pet-settings')
    assert response.status_code == 200
    assert response.json()['voice'] == 'test-voice'
    assert response.json()['memory_block'] == 'test-memory'
    assert 'test-secret' not in response.text
    assert 'embed_key' not in response.json()


@pytest.mark.parametrize('method,path', [
    ('get', '/users'), ('post', '/users'), ('patch', '/users/1'), ('delete', '/users/1'),
    ('get', '/registration-requests'), ('post', '/registration-requests/1/approve'),
    ('post', '/registration-requests/1/reject'),
])
def test_all_admin_operations_reject_regular_user(context, method, path):
    app, client, _ = context
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=1, role='user')
    assert client.request(method, '/api/admin' + path, json={}).status_code == 403


def test_ledger_snapshot_lifecycle(context, monkeypatch):
    app, client, db = context
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=1, role='user')
    # Avoid unrelated startup migrations; exercise actual ledger table queries.
    monkeypatch.setattr(life, 'ensure_tables', lambda session: life._pet_table(session))
    first = client.get('/api/life/ledger').json()
    assert first['matched_snapshot'] is None
    assert first['last_saved_at'] is None
    saved = client.get('/api/life/ledger?save=1').json()
    assert saved['matched_snapshot'] is True
    assert saved['last_saved_at'] > 0
    db.execute(text("INSERT INTO pet_episodes(kind,text,importance) VALUES('fact','new memory',0.5)"))
    db.commit()
    changed = client.get('/api/life/ledger').json()
    assert changed['matched_snapshot'] is False
    assert changed['last_saved_at'] == saved['last_saved_at']


def test_backup_includes_committed_wal_data(tmp_path):
    import sqlite3
    source = tmp_path / 'live.db'
    with closing(sqlite3.connect(source)) as db:
        db.execute('PRAGMA journal_mode=WAL')
        db.execute('CREATE TABLE user(id INTEGER)')
        db.execute('CREATE TABLE pet_episodes(text TEXT)')
        db.execute("INSERT INTO pet_episodes VALUES('latest memory')")
        db.commit()
        result = backup_database(source, tmp_path / 'backups')
        with closing(sqlite3.connect(result)) as restored:
            assert restored.execute('PRAGMA integrity_check').fetchone() == ('ok',)
            assert restored.execute('SELECT text FROM pet_episodes').fetchall() == [('latest memory',)]


def test_backup_rejects_wrong_database(tmp_path):
    import sqlite3
    source = tmp_path / 'other.db'
    sqlite3.connect(source).close()
    with pytest.raises(RuntimeError, match='required'):
        backup_database(source, tmp_path / 'backups')
    assert not list((tmp_path / 'backups').glob('*.db'))
