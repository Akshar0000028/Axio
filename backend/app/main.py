import os
import uuid
import json
import logging
import asyncio
from concurrent.futures import ThreadPoolExecutor
from typing import Optional
from datetime import datetime, timedelta

import pandas as pd
import numpy as np
import joblib

from fastapi import FastAPI, File, UploadFile, HTTPException, BackgroundTasks, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.security import APIKeyHeader

from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from .schemas import (
    AnalyzeResponse, TrainRequest, TrainResponse,
    PredictRequest, PredictResponse,
    ChatRequest, ChatResponse,
)
from .pipeline import analyze_dataset_pipeline, train_pipeline
from .ml_agent import generate_chat_response
from .session_store import SessionStore

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# ── Config ────────────────────────────────────────────────────────────────────

ALLOWED_ORIGINS = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:5173,http://localhost:3000"
).split(",")

IS_PROD = os.getenv("ENV", "production") == "production"

AXIO_API_KEY = os.getenv("AXIO_API_KEY", "")
API_KEY_HEADER = APIKeyHeader(name="X-API-Key", auto_error=False)

SESSION_TTL_HOURS = int(os.getenv("SESSION_TTL_HOURS", "24"))
ALLOWED_EXTENSIONS = {".csv", ".xlsx", ".xls"}
MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "50"))

BASE_DIR = os.path.dirname(__file__)
DATA_DIR = os.path.join(BASE_DIR, "..", "data")
EXPORTS_DIR = os.path.join(BASE_DIR, "..", "exports")
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(EXPORTS_DIR, exist_ok=True)

# ── Rate limiter ──────────────────────────────────────────────────────────────

limiter = Limiter(key_func=get_remote_address, default_limits=["200/hour"])

# ── Session store (Redis if available, memory fallback) ───────────────────────

store = SessionStore(
    redis_url=os.getenv("REDIS_URL", ""),
    ttl_hours=SESSION_TTL_HOURS,
)

# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Axio ML API",
    description="Upload datasets, train ML models, and get predictions.",
    version="2.1.0",
    docs_url=None if IS_PROD else "/docs",
    redoc_url=None,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Content-Type", "Authorization", "X-API-Key"],
)

_executor = ThreadPoolExecutor(max_workers=int(os.getenv("TRAIN_WORKERS", "4")))

# ── Auth dependency ───────────────────────────────────────────────────────────

async def verify_api_key(api_key: str = Depends(API_KEY_HEADER)):
    """Require X-API-Key header when AXIO_API_KEY is set in env."""
    if not AXIO_API_KEY:
        return  # Key not configured — open (dev convenience)
    if api_key != AXIO_API_KEY:
        raise HTTPException(
            status_code=401,
            detail="Invalid or missing API key. Set X-API-Key header.",
            headers={"WWW-Authenticate": "ApiKey"},
        )

# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_session(session_id: str) -> dict:
    session = store.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found.")
    return session


def _read_dataframe(filepath: str) -> pd.DataFrame:
    if filepath.endswith(".csv"):
        return pd.read_csv(filepath, low_memory=False)
    return pd.read_excel(filepath)


def _safe_prediction_value(prediction):
    if prediction is None:
        return None
    try:
        if pd.isna(prediction):
            return None
    except (TypeError, ValueError):
        pass
    if isinstance(prediction, (np.integer,)):
        return int(prediction)
    if isinstance(prediction, (np.floating,)):
        return float(prediction)
    if isinstance(prediction, (np.bool_,)):
        return bool(prediction)
    return prediction


def _exports_dir(session_id: str) -> str:
    return os.path.join(EXPORTS_DIR, session_id)

# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/health", tags=["system"])
def health_check():
    return {
        "status": "ok",
        "sessions_active": store.count(),
        "session_backend": store.backend_name(),
        "auth_enabled": bool(AXIO_API_KEY),
    }


@app.post("/upload", response_model=AnalyzeResponse, tags=["data"],
          dependencies=[Depends(verify_api_key)])
@limiter.limit("30/minute")
async def upload_dataset(request: Request, file: UploadFile = File(...)):
    ext = os.path.splitext(file.filename or "")[-1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=415, detail=f"Unsupported file type '{ext}'.")

    session_id = str(uuid.uuid4())
    safe_name = "".join(c for c in (file.filename or "upload") if c.isalnum() or c in ".-_")
    filepath = os.path.join(DATA_DIR, f"{session_id}_{safe_name}")

    content = await file.read()
    if len(content) > MAX_UPLOAD_MB * 1024 * 1024:
        raise HTTPException(status_code=413, detail=f"File exceeds {MAX_UPLOAD_MB} MB limit.")

    with open(filepath, "wb") as f:
        f.write(content)

    try:
        df = _read_dataframe(filepath)
        if df.empty:
            raise ValueError("Uploaded file is empty.")

        loop = asyncio.get_event_loop()
        analysis = await loop.run_in_executor(_executor, analyze_dataset_pipeline, df)

        store.set(session_id, {
            "session_id": session_id,
            "filepath": filepath,
            "filename": file.filename,
            "analysis": analysis,
            "created_at": datetime.utcnow().isoformat(),
        })

        logger.info(f"Session {session_id} created — {analysis['row_count']} rows, {analysis['col_count']} cols")

        return AnalyzeResponse(
            session_id=session_id,
            filename=file.filename,
            row_count=analysis["row_count"],
            col_count=analysis["col_count"],
            features=analysis["features"],
            recommended_target=analysis.get("recommended_target"),
            problem_type=None,
            recommendations=[],
        )
    except Exception as e:
        if os.path.exists(filepath):
            os.remove(filepath)
        logger.exception(f"Upload failed: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/chat", response_model=ChatResponse, tags=["ai"],
          dependencies=[Depends(verify_api_key)])
@limiter.limit("60/minute")
def chat_endpoint(request: Request, req: ChatRequest):
    context = store.get(req.session_id) or {}
    return generate_chat_response(req.message, req.history, context)


@app.post("/train", tags=["ml"], dependencies=[Depends(verify_api_key)])
@limiter.limit("10/minute")
def train_model(request: Request, req: TrainRequest):
    session = _get_session(req.session_id)
    df = _read_dataframe(session["filepath"])
    try:
        result = train_pipeline(
            session_id=req.session_id,
            df=df,
            target_column=req.target_column,
            model_key=req.model_key,
            test_size=req.test_size,
            cross_validate=req.cross_validate,
            n_cv_folds=req.n_cv_folds,
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.exception(f"Training failed for session {req.session_id}")
        raise HTTPException(status_code=500, detail=f"Training error: {e}")

    session["last_train"] = {
        "model_key": req.target_column,
        "problem_type": result["problem_type"],
    }
    store.set(req.session_id, session)

    logger.info(f"Session {req.session_id} trained '{result['model_name']}' ({result['problem_type']})")
    return result


@app.post("/predict", response_model=PredictResponse, tags=["ml"],
          dependencies=[Depends(verify_api_key)])
@limiter.limit("120/minute")
def predict(request: Request, req: PredictRequest):
    exp_dir = _exports_dir(req.session_id)
    model_path = os.path.join(exp_dir, "model.joblib")
    if not os.path.exists(model_path):
        raise HTTPException(status_code=404, detail="No trained model found. Call /train first.")

    clf = joblib.load(model_path)
    le_path = os.path.join(exp_dir, "target_encoder.joblib")
    label_encoder = joblib.load(le_path) if os.path.exists(le_path) else None
    input_df = pd.DataFrame([req.features])

    try:
        prediction_raw = clf.predict(input_df)[0]
        probabilities: Optional[dict] = None
        confidence: Optional[float] = None
        model_step = clf.named_steps.get("model")
        if model_step and hasattr(model_step, "predict_proba"):
            probs = clf.predict_proba(input_df)[0]
            confidence = float(probs.max())
            if label_encoder is not None:
                probabilities = {str(c): float(p) for c, p in zip(label_encoder.classes_, probs)}
            else:
                probabilities = {str(i): float(p) for i, p in enumerate(probs)}
        if label_encoder is not None:
            prediction_raw = label_encoder.inverse_transform([prediction_raw])[0]
        return PredictResponse(
            prediction=_safe_prediction_value(prediction_raw),
            confidence=confidence,
            probabilities=probabilities,
        )
    except Exception as e:
        logger.exception(f"Prediction failed for session {req.session_id}")
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/export/model/{session_id}", tags=["export"],
         dependencies=[Depends(verify_api_key)])
def export_model(session_id: str):
    model_path = os.path.join(_exports_dir(session_id), "model.joblib")
    if not os.path.exists(model_path):
        raise HTTPException(status_code=404, detail="Model not found. Train first.")
    return FileResponse(model_path, media_type="application/octet-stream",
                        filename=f"axio_model_{session_id}.joblib")


@app.delete("/session/{session_id}", tags=["system"],
            dependencies=[Depends(verify_api_key)])
def delete_session(session_id: str):
    session = store.get(session_id)
    store.delete(session_id)
    if session:
        try:
            fp = session.get("filepath")
            if fp and os.path.exists(fp):
                os.remove(fp)
        except OSError:
            pass
    return {"deleted": session_id, "found": session is not None}


# ── Static file serving (SPA fallback) ────────────────────────────────────────

FRONTEND_DIST = os.path.join(BASE_DIR, "..", "..", "frontend", "dist")

if os.path.exists(FRONTEND_DIST):
    # Mount assets (js, css, etc)
    assets_dir = os.path.join(FRONTEND_DIST, "assets")
    if os.path.exists(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    # Serve index.html for all other non-API routes
    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        # Prevent intercepting API/Health/Docs logic
        if full_path.startswith(("health", "upload", "train", "predict", "chat", "export", "session", "docs")):
            raise HTTPException(status_code=404)
        
        index_file = os.path.join(FRONTEND_DIST, "index.html")
        if os.path.exists(index_file):
            return FileResponse(index_file)
        raise HTTPException(status_code=404, detail="Frontend index.html not found.")
else:
    logger.warning(f"Frontend dist not found at {FRONTEND_DIST}. Static serving disabled.")
