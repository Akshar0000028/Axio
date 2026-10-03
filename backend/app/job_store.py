"""Small SQLite-backed training job store.

Job metadata survives API restarts, while the process-local executor handles
the actual CPU work. Interrupted jobs are marked failed on startup rather than
being left indefinitely in a running state.
"""
import json
import os
import sqlite3
import uuid
from datetime import datetime

BASE_DIR = os.path.dirname(__file__)
DB_PATH = os.path.join(BASE_DIR, "..", "data", "jobs.db")


def _connect():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_job_db():
    with _connect() as conn:
        conn.execute("""CREATE TABLE IF NOT EXISTS training_jobs (
            id TEXT PRIMARY KEY, session_id TEXT NOT NULL, owner_id TEXT NOT NULL,
            project_id TEXT, status TEXT NOT NULL, progress INTEGER NOT NULL DEFAULT 0,
            request TEXT NOT NULL, result TEXT, error TEXT,
            created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        )""")
        conn.execute("UPDATE training_jobs SET status='queued', error=NULL, updated_at=? WHERE status IN ('running', 'queued')",
                     (datetime.utcnow().isoformat(),))
        conn.commit()


def create_job(session_id, owner_id, project_id, request):
    now = datetime.utcnow().isoformat()
    job = {"id": str(uuid.uuid4()), "session_id": session_id, "owner_id": owner_id,
           "project_id": project_id, "status": "queued", "progress": 0,
           "request": request, "result": None, "error": None,
           "created_at": now, "updated_at": now}
    with _connect() as conn:
        conn.execute("INSERT INTO training_jobs VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                     (job["id"], job["session_id"], job["owner_id"], job["project_id"], job["status"],
                      job["progress"], json.dumps(request), None, None, now, now))
        conn.commit()
    return job


def update_job(job_id, **changes):
    allowed = {"status", "progress", "result", "error"}
    changes = {key: value for key, value in changes.items() if key in allowed}
    if not changes:
        return get_job(job_id)
    changes["updated_at"] = datetime.utcnow().isoformat()
    encoded = {"result": lambda v: json.dumps(v, default=str), "error": str}
    assignments = ", ".join(f"{key}=?" for key in changes)
    values = [encoded.get(key, lambda v: v)(value) for key, value in changes.items()]
    with _connect() as conn:
        conn.execute(f"UPDATE training_jobs SET {assignments} WHERE id=?", (*values, job_id))
        conn.commit()
    return get_job(job_id)


def get_job(job_id, owner_id=None):
    with _connect() as conn:
        row = conn.execute("SELECT * FROM training_jobs WHERE id=? AND (? IS NULL OR owner_id=?)",
                           (job_id, owner_id, owner_id)).fetchone()
    if not row:
        return None
    result = dict(row)
    result["request"] = json.loads(result["request"])
    result["result"] = json.loads(result["result"]) if result["result"] else None
    return result


def list_pending_jobs():
    with _connect() as conn:
        rows = conn.execute("SELECT id FROM training_jobs WHERE status IN ('queued', 'running') ORDER BY created_at").fetchall()
    return [get_job(row["id"]) for row in rows]
