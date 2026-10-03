import sqlite3
import os
import json
from datetime import datetime

BASE_DIR = os.path.dirname(__file__)
DB_PATH = os.path.join(BASE_DIR, "..", "data", "chat.db")

def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute('''
            CREATE TABLE IF NOT EXISTS chat_sessions (
                session_id TEXT PRIMARY KEY,
                label TEXT,
                owner_id TEXT,
                updated_at DATETIME
            )
        ''')
        columns = {row[1] for row in conn.execute("PRAGMA table_info(chat_sessions)").fetchall()}
        if "owner_id" not in columns:
            conn.execute("ALTER TABLE chat_sessions ADD COLUMN owner_id TEXT")
        conn.execute('''
            CREATE TABLE IF NOT EXISTS chat_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT,
                role TEXT,
                content TEXT,
                actions TEXT,
                metrics TEXT,
                created_at DATETIME,
                FOREIGN KEY(session_id) REFERENCES chat_sessions(session_id)
            )
        ''')
        conn.commit()

def save_message(session_id: str, role: str, content: str, actions: list = None, metrics: list = None, session_label: str = "Chat Session", owner_id: str = None):
    with sqlite3.connect(DB_PATH) as conn:
        # Upsert session
        conn.execute('''
            INSERT INTO chat_sessions (session_id, label, owner_id, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(session_id) DO UPDATE SET updated_at=excluded.updated_at, owner_id=COALESCE(chat_sessions.owner_id, excluded.owner_id)
        ''', (session_id, session_label, owner_id, datetime.utcnow().isoformat()))
        
        # Insert message
        actions_str = json.dumps(actions or [])
        metrics_str = json.dumps(metrics or [])
        conn.execute('''
            INSERT INTO chat_messages (session_id, role, content, actions, metrics, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (session_id, role, content, actions_str, metrics_str, datetime.utcnow().isoformat()))
        conn.commit()

def get_history(session_id: str, owner_id: str = None) -> list:
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute('''
            SELECT m.* FROM chat_messages m
            LEFT JOIN chat_sessions s ON s.session_id = m.session_id
            WHERE m.session_id = ? AND (? IS NULL OR s.owner_id = ?)
            ORDER BY m.id ASC
        ''', (session_id, owner_id, owner_id)).fetchall()
        
        return [
            {
                "id": row["id"],
                "role": row["role"],
                "content": row["content"],
                "actions": json.loads(row["actions"]) if row["actions"] else [],
                "metrics": json.loads(row["metrics"]) if row["metrics"] else [],
                "created_at": row["created_at"],
            }
            for row in rows
        ]

def get_sessions(owner_id: str = None) -> list:
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute('SELECT * FROM chat_sessions WHERE (? IS NULL OR owner_id = ?) ORDER BY updated_at DESC', (owner_id, owner_id)).fetchall()
        return [dict(row) for row in rows]
