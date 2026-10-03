"""User persistence and JWT authentication helpers."""
import hashlib
import hmac
import os
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone

import jwt

BASE_DIR = os.path.dirname(__file__)
DB_PATH = os.path.join(BASE_DIR, "..", "data", "platform.db")
JWT_SECRET = os.getenv("JWT_SECRET", "dev-only-change-this-jwt-secret")
if os.getenv("ENV", "production") == "production" and len(JWT_SECRET) < 32:
    raise RuntimeError("JWT_SECRET must be at least 32 characters in production.")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", "1440"))
JWT_ISSUER = os.getenv("JWT_ISSUER", "axio")


def _connect():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_auth_db():
    with _connect() as conn:
        conn.execute("""CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
            password_hash TEXT NOT NULL, created_at TEXT NOT NULL
        )""")
        conn.commit()


def _hash_password(password: str, salt: bytes | None = None) -> str:
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 310_000)
    return f"pbkdf2_sha256$310000${salt.hex()}${digest.hex()}"


def _verify_password(password: str, encoded: str) -> bool:
    try:
        scheme, iterations, salt_hex, digest_hex = encoded.split("$", 3)
        if scheme != "pbkdf2_sha256":
            return False
        candidate = hashlib.pbkdf2_hmac(
            "sha256", password.encode(), bytes.fromhex(salt_hex), int(iterations)
        ).hex()
        return hmac.compare_digest(candidate, digest_hex)
    except (ValueError, TypeError):
        return False


def create_user(email: str, name: str, password: str):
    user = {"id": secrets.token_urlsafe(16), "email": email.lower().strip(), "name": name.strip(),
            "password_hash": _hash_password(password), "created_at": datetime.now(timezone.utc).isoformat()}
    try:
        with _connect() as conn:
            conn.execute("INSERT INTO users VALUES (?, ?, ?, ?, ?)", tuple(user.values()))
            conn.commit()
    except sqlite3.IntegrityError:
        return None
    return {key: value for key, value in user.items() if key != "password_hash"}


def authenticate_user(email: str, password: str):
    with _connect() as conn:
        row = conn.execute("SELECT * FROM users WHERE email = ?", (email.lower().strip(),)).fetchone()
    if not row or not _verify_password(password, row["password_hash"]):
        return None
    return {"id": row["id"], "email": row["email"], "name": row["name"], "created_at": row["created_at"]}


def get_user(user_id: str):
    with _connect() as conn:
        row = conn.execute("SELECT id, email, name, created_at FROM users WHERE id = ?", (user_id,)).fetchone()
    return dict(row) if row else None


def get_user_by_email(email: str):
    with _connect() as conn:
        row = conn.execute("SELECT id, email, name, created_at FROM users WHERE email = ?", (email.lower().strip(),)).fetchone()
    return dict(row) if row else None


def create_access_token(user: dict) -> str:
    now = datetime.now(timezone.utc)
    payload = {"sub": user["id"], "email": user["email"], "name": user["name"],
               "iss": JWT_ISSUER, "iat": now, "exp": now + timedelta(minutes=JWT_EXPIRE_MINUTES)}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str):
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM], issuer=JWT_ISSUER)
        return get_user(payload["sub"]) if payload.get("sub") else None
    except (jwt.PyJWTError, KeyError):
        return None
