import os
import multiprocessing

# Bind
bind = f"0.0.0.0:{os.getenv('PORT', '8000')}"

# Workers — 2x CPU cores + 1 is standard for I/O-bound apps
workers = int(os.getenv("WEB_WORKERS", multiprocessing.cpu_count() * 2 + 1))
worker_class = "uvicorn.workers.UvicornWorker"

# Timeouts — training can take a while
timeout = 180
keepalive = 5

# Logging
accesslog = "-"
errorlog = "-"
loglevel = os.getenv("LOG_LEVEL", "info")

# Graceful restart
graceful_timeout = 30
max_requests = 1000
max_requests_jitter = 50
