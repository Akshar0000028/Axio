"""
session_store.py — Redis-backed session storage with in-memory fallback.

Priority:
  1. Redis  (if REDIS_URL is set and redis-py is installed)
  2. In-process dict  (single-process dev / fallback)

The in-memory fallback is intentionally simple — it will not survive
restarts or work across multiple gunicorn workers.  Set REDIS_URL in
production.
"""

import json
import logging
from datetime import datetime, timedelta
from typing import Optional

logger = logging.getLogger(__name__)


class SessionStore:
    def __init__(self, redis_url: str = "", ttl_hours: int = 24):
        self._ttl = timedelta(hours=ttl_hours)
        self._ttl_seconds = ttl_hours * 3600
        self._redis = None
        self._mem: dict[str, dict] = {}

        if redis_url:
            try:
                import redis  # type: ignore
                self._redis = redis.from_url(redis_url, decode_responses=True, socket_connect_timeout=3)
                self._redis.ping()
                logger.info(f"SessionStore: connected to Redis at {redis_url}")
            except Exception as e:
                logger.warning(f"SessionStore: Redis unavailable ({e}), falling back to in-memory store")
                self._redis = None
        else:
            logger.warning(
                "SessionStore: REDIS_URL not set — using in-memory store. "
                "Sessions will be lost on restart. Set REDIS_URL for production."
            )

    # ── Public API ────────────────────────────────────────────────────────────

    def get(self, session_id: str) -> Optional[dict]:
        if self._redis:
            raw = self._redis.get(f"session:{session_id}")
            if raw is None:
                return None
            try:
                return json.loads(raw)
            except json.JSONDecodeError:
                return None
        else:
            entry = self._mem.get(session_id)
            if entry is None:
                return None
            # Evict if expired
            created = datetime.fromisoformat(entry.get("created_at", datetime.utcnow().isoformat()))
            if datetime.utcnow() - created > self._ttl:
                self._mem.pop(session_id, None)
                return None
            return entry

    def set(self, session_id: str, data: dict) -> None:
        # Keep the in-memory fallback's expiry semantics identical to Redis.
        # Callers may update an existing record, so preserve its original age.
        data = dict(data)
        data.setdefault("created_at", datetime.utcnow().isoformat())
        if self._redis:
            self._redis.setex(
                f"session:{session_id}",
                self._ttl_seconds,
                json.dumps(data, default=str),
            )
        else:
            self._mem[session_id] = data

    def delete(self, session_id: str) -> None:
        if self._redis:
            self._redis.delete(f"session:{session_id}")
        else:
            self._mem.pop(session_id, None)

    def count(self) -> int:
        if self._redis:
            try:
                return len(self._redis.keys("session:*"))
            except Exception:
                return -1
        return len(self._mem)

    def backend_name(self) -> str:
        return "redis" if self._redis else "memory"
