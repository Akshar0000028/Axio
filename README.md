# Axio ML Platform — v2.1 (Production-Ready)

## What's new in v2.1

| # | Fix | How |
|---|-----|-----|
| 1 | **Auth** | `X-API-Key` header on every API call. Set `AXIO_API_KEY` in backend `.env` and `VITE_API_KEY` in frontend `.env`. |
| 2 | **Persistent sessions** | Redis-backed `SessionStore` — sessions survive restarts, crashes, and multi-worker deploys. Falls back to in-memory automatically if Redis is unavailable. |
| 3 | **Rate limiting** | `slowapi` on every endpoint — `/train` capped at 10 req/min, `/upload` at 30/min, `/chat` at 60/min, `/predict` at 120/min. Returns HTTP 429 on breach. |

---

## Quick start (Docker Compose — recommended)

```bash
# 1. Copy and fill in secrets
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# 2. Generate a strong API key
python -c "import secrets; print(secrets.token_hex(32))"
# Paste output into AXIO_API_KEY (backend .env) and VITE_API_KEY (frontend .env)

# 3. Start everything (Redis + backend + frontend)
docker compose up --build
```

Redis is included in `docker-compose.yml` — no separate install needed.

---

## Environment variables

### Backend (`backend/.env`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NVIDIA_API_KEY` | ✅ | — | NVIDIA NIM API key |
| `AXIO_API_KEY` | ⚠️ | *(empty = disabled)* | API key for all endpoints |
| `REDIS_URL` | ⚠️ | *(empty = memory)* | Redis connection string |
| `ALLOWED_ORIGINS` | | `localhost` | CORS origins |
| `ENV` | | `production` | `production` hides `/docs` |
| `MAX_UPLOAD_MB` | | `50` | Upload size cap |
| `SESSION_TTL_HOURS` | | `24` | Session expiry |
| `TRAIN_WORKERS` | | `4` | Gunicorn thread workers |

### Frontend (`frontend/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_API_URL` | | Backend URL (empty = same origin) |
| `VITE_API_KEY` | ⚠️ | Must match `AXIO_API_KEY` |

---

## Rate limits

| Endpoint | Limit |
|----------|-------|
| `/upload` | 30 req/min per IP |
| `/train` | 10 req/min per IP |
| `/chat` | 60 req/min per IP |
| `/predict` | 120 req/min per IP |
| All endpoints | 200 req/hour per IP |

---

## Health check

```bash
curl http://localhost:8000/health
# {"status":"ok","sessions_active":0,"session_backend":"redis","auth_enabled":true}
```

`session_backend` will show `"redis"` when connected or `"memory"` as fallback.

---

## Nginx

See `nginx/axio.conf` for SSL + reverse proxy config. No changes needed for v2.1.
