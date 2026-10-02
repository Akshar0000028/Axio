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
            problem_type TEXT NOT NULL, metrics TEXT NOT NULL, created_at TEXT NOT NULL,
            FOREIGN KEY(project_id) REFERENCES projects(id)
        )""")
        conn.commit()

def list_projects(owner_id: str):
    with _connect() as conn:
        return [dict(row) for row in conn.execute(
            "SELECT * FROM projects WHERE owner_id = ? ORDER BY updated_at DESC", (owner_id,)
        ).fetchall()]

def get_project(project_id: str, owner_id: str):
    with _connect() as conn:
        row = conn.execute(
            "SELECT * FROM projects WHERE id = ? AND owner_id = ?",
            (project_id, owner_id),
        ).fetchone()
    return dict(row) if row else None

def create_project(name: str, description: str, owner_id: str):
    now = datetime.utcnow().isoformat()
    project = {"id": str(uuid.uuid4()), "name": name.strip(), "description": description.strip(),
               "owner_id": owner_id, "created_at": now, "updated_at": now}
    with _connect() as conn:
        conn.execute("INSERT INTO projects VALUES (?, ?, ?, ?, ?, ?)", tuple(project.values()))
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
            "SELECT * FROM project_datasets WHERE project_id = ? AND owner_id = ? ORDER BY created_at DESC",
            (project_id, owner_id),
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
    run = {
        "id": str(uuid.uuid4()),
        "project_id": project_id,
        "owner_id": owner_id,
        "session_id": session_id,
        "model_name": result["model_name"],
        "problem_type": result["problem_type"],
        "metrics": json.dumps(result["metrics"], default=str),
        "created_at": datetime.utcnow().isoformat(),
    }
    with _connect() as conn:
        conn.execute("INSERT INTO project_runs VALUES (?, ?, ?, ?, ?, ?, ?, ?)", tuple(run.values()))
        conn.commit()
    return {**run, "metrics": result["metrics"]}

def list_runs(project_id: str, owner_id: str):
    with _connect() as conn:
        rows = conn.execute(
            "SELECT * FROM project_runs WHERE project_id = ? AND owner_id = ? ORDER BY created_at DESC",
            (project_id, owner_id),
        ).fetchall()
    return [{**dict(row), "metrics": json.loads(row["metrics"])} for row in rows]
