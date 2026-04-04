# ── Stage 1: Build frontend ────────────────────────────
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci --silent
COPY frontend/ .
RUN npm run build

# ── Stage 2: Python backend + serve static ─────────────
FROM python:3.11-slim

WORKDIR /app

# System deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libgomp1 curl \
    && rm -rf /var/lib/apt/lists/*

# Python deps
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source
COPY backend/ ./backend/

# Copy built frontend
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Runtime dirs
RUN mkdir -p backend/data backend/exports

ENV ENV=production
ENV PORT=8000

EXPOSE 8000

CMD ["gunicorn", "backend.app.main:app", "--config", "backend/gunicorn.conf.py"]
