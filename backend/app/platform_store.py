"""Persistence for the first platform migration."""
import os
import sqlite3
import uuid
import json
from datetime import datetime

BASE_DIR = os.path.dirname(__file__)
DB_PATH = os.path.join(BASE_DIR, "..", "data", "platform.db")

def _connect():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_platform_db():
    with _connect() as conn:
        conn.execute("""CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT DEFAULT '',
            owner_id TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        )""")
        conn.execute("""CREATE TABLE IF NOT EXISTS project_datasets (
            id TEXT PRIMARY KEY, project_id TEXT NOT NULL, owner_id TEXT NOT NULL,
            session_id TEXT NOT NULL UNIQUE, filename TEXT NOT NULL,
            row_count INTEGER NOT NULL, col_count INTEGER NOT NULL,
            analysis TEXT NOT NULL, created_at TEXT NOT NULL,
            FOREIGN KEY(project_id) REFERENCES projects(id)
        )""")
        conn.execute("""CREATE TABLE IF NOT EXISTS project_runs (
            id TEXT PRIMARY KEY, project_id TEXT NOT NULL, owner_id TEXT NOT NULL,
            session_id TEXT NOT NULL, model_name TEXT NOT NULL,
            problem_type TEXT NOT NULL, metrics TEXT NOT NULL, parameters TEXT DEFAULT '{}',
            model_version TEXT DEFAULT 'v1', created_at TEXT NOT NULL,
            FOREIGN KEY(project_id) REFERENCES projects(id)
        )""")
        conn.execute("""CREATE TABLE IF NOT EXISTS project_members (
            project_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL,
            created_at TEXT NOT NULL, PRIMARY KEY(project_id, user_id)
        )""")
        conn.execute("""CREATE TABLE IF NOT EXISTS audit_events (
            id TEXT PRIMARY KEY, project_id TEXT NOT NULL, actor_id TEXT NOT NULL,
            action TEXT NOT NULL, resource TEXT NOT NULL, metadata TEXT NOT NULL,
            created_at TEXT NOT NULL
        )""")
        # Backfill membership rows for projects created before collaboration
        # support was added. The users table is created by auth_store startup.
        try:
            conn.execute("INSERT OR IGNORE INTO project_members (project_id, user_id, role, created_at) SELECT id, owner_id, 'owner', created_at FROM projects")
        except sqlite3.OperationalError:
            pass
        columns = {row[1] for row in conn.execute("PRAGMA table_info(project_runs)").fetchall()}
        if "parameters" not in columns:
            conn.execute("ALTER TABLE project_runs ADD COLUMN parameters TEXT DEFAULT '{}'")
        if "model_version" not in columns:
            conn.execute("ALTER TABLE project_runs ADD COLUMN model_version TEXT DEFAULT 'v1'")
        conn.commit()

def list_projects(owner_id: str):
    with _connect() as conn:
        return [dict(row) for row in conn.execute(
            "SELECT p.* FROM projects p JOIN project_members m ON m.project_id=p.id WHERE m.user_id = ? ORDER BY p.updated_at DESC", (owner_id,)
        ).fetchall()]

def get_project(project_id: str, owner_id: str):
    with _connect() as conn:
        row = conn.execute(
            "SELECT p.* FROM projects p JOIN project_members m ON m.project_id=p.id WHERE p.id = ? AND m.user_id = ?",
            (project_id, owner_id),
        ).fetchone()
    return dict(row) if row else None

def create_project(name: str, description: str, owner_id: str):
    now = datetime.utcnow().isoformat()
    project = {"id": str(uuid.uuid4()), "name": name.strip(), "description": description.strip(),
               "owner_id": owner_id, "created_at": now, "updated_at": now}
    with _connect() as conn:
        conn.execute("INSERT INTO projects VALUES (?, ?, ?, ?, ?, ?)", tuple(project.values()))
        conn.execute("INSERT INTO project_members VALUES (?, ?, ?, ?)", (project["id"], owner_id, "owner", now))
        conn.commit()
    return project

def register_dataset(project_id: str, owner_id: str, session_id: str, filename: str, analysis: dict):
    dataset = {
        "id": str(uuid.uuid4()),
        "project_id": project_id,
        "owner_id": owner_id,
        "session_id": session_id,
        "filename": filename,
        "row_count": analysis["row_count"],
        "col_count": analysis["col_count"],
        "analysis": json.dumps(analysis, default=str),
        "created_at": datetime.utcnow().isoformat(),
    }
    with _connect() as conn:
        conn.execute(
            "INSERT INTO project_datasets VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            tuple(dataset.values()),
        )
        conn.commit()
    return {**dataset, "analysis": analysis}

def list_datasets(project_id: str, owner_id: str):
    with _connect() as conn:
        rows = conn.execute(
            "SELECT * FROM project_datasets WHERE project_id = ? ORDER BY created_at DESC",
            (project_id,),
        ).fetchall()
    return [
        {**dict(row), "analysis": json.loads(row["analysis"])}
        for row in rows
    ]

def get_dataset_by_session(session_id: str):
    """Return a persisted dataset record so runtime sessions can be restored."""
    with _connect() as conn:
        row = conn.execute(
            "SELECT * FROM project_datasets WHERE session_id = ?",
            (session_id,),
        ).fetchone()
    if not row:
        return None
    return {**dict(row), "analysis": json.loads(row["analysis"])}

def register_run(project_id: str, owner_id: str, session_id: str, result: dict):
    with _connect() as conn:
        prior = conn.execute("SELECT COUNT(*) FROM project_runs WHERE project_id = ?", (project_id,)).fetchone()[0]
    run = {
        "id": str(uuid.uuid4()),
        "project_id": project_id,
        "owner_id": owner_id,
        "session_id": session_id,
        "model_name": result["model_name"],
        "problem_type": result["problem_type"],
        "metrics": json.dumps(result["metrics"], default=str),
        "parameters": json.dumps(result.get("parameters", {}), default=str),
        "model_version": result.get("model_version", f"v{prior + 1}"),
        "created_at": datetime.utcnow().isoformat(),
    }
    with _connect() as conn:
        conn.execute("""INSERT INTO project_runs
            (id, project_id, owner_id, session_id, model_name, problem_type,
             metrics, parameters, model_version, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""", tuple(run.values()))
        conn.commit()
    return {**run, "metrics": result["metrics"], "parameters": result.get("parameters", {})}

def list_runs(project_id: str, owner_id: str):
    with _connect() as conn:
        rows = conn.execute(
            "SELECT * FROM project_runs WHERE project_id = ? ORDER BY created_at DESC",
            (project_id,),
        ).fetchall()
    return [{**dict(row), "metrics": json.loads(row["metrics"]), "parameters": json.loads(row["parameters"] or "{}")} for row in rows]


def add_member(project_id: str, user_id: str, role: str):
    now = datetime.utcnow().isoformat()
    with _connect() as conn:
        conn.execute("INSERT OR REPLACE INTO project_members VALUES (?, ?, ?, ?)", (project_id, user_id, role, now))
        conn.commit()
    return get_member(project_id, user_id)


def get_member(project_id: str, user_id: str):
    with _connect() as conn:
        row = conn.execute("""SELECT m.project_id, m.user_id, u.email, u.name, m.role, m.created_at
            FROM project_members m JOIN users u ON u.id=m.user_id
            WHERE m.project_id=? AND m.user_id=?""", (project_id, user_id)).fetchone()
    return dict(row) if row else None


def list_members(project_id: str):
    with _connect() as conn:
        rows = conn.execute("""SELECT m.project_id, m.user_id, u.email, u.name, m.role, m.created_at
            FROM project_members m JOIN users u ON u.id=m.user_id
            WHERE m.project_id=? ORDER BY m.created_at""", (project_id,)).fetchall()
    return [dict(row) for row in rows]


def record_audit(project_id: str, actor_id: str, action: str, resource: str, metadata: dict | None = None):
    event = {"id": str(uuid.uuid4()), "project_id": project_id, "actor_id": actor_id,
             "action": action, "resource": resource, "metadata": json.dumps(metadata or {}),
             "created_at": datetime.utcnow().isoformat()}
    with _connect() as conn:
        conn.execute("INSERT INTO audit_events VALUES (?, ?, ?, ?, ?, ?, ?)", tuple(event.values()))
        conn.commit()
    event["metadata"] = metadata or {}
    return event


def list_audit(project_id: str):
    with _connect() as conn:
        rows = conn.execute("SELECT * FROM audit_events WHERE project_id=? ORDER BY created_at DESC", (project_id,)).fetchall()
    return [{**dict(row), "metadata": json.loads(row["metadata"] or "{}")} for row in rows]
