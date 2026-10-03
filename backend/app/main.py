import os
import uuid
import json
import logging
import asyncio
import secrets
import shutil
from concurrent.futures import ThreadPoolExecutor
from typing import Optional
from datetime import datetime, timedelta

import pandas as pd
import numpy as np
import joblib

from werkzeug.utils import secure_filename
from fastapi import FastAPI, File, UploadFile, HTTPException, BackgroundTasks, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.security import APIKeyHeader, HTTPAuthorizationCredentials, HTTPBearer

from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from .schemas import (
    AnalyzeResponse, TrainRequest, TrainResponse,
    PredictRequest, PredictResponse,
    ChatRequest, ChatResponse, ChartDisplay, MetricDisplay, ProjectCreate, ProjectResponse, DatasetResponse, RunResponse,
    RegisterRequest, LoginRequest, AuthResponse, UserResponse,
)
from .pipeline import analyze_dataset_pipeline, train_pipeline
from .ml_agent import generate_chat_response
from .agents import build_agent_run
from .session_store import SessionStore
from .database import init_db, save_message, get_history, get_sessions
from .platform_store import (
    init_platform_db, list_projects, create_project, get_project,
    register_dataset, list_datasets, get_dataset_by_session, register_run, list_runs,
)
from .auth_store import (
    JWT_EXPIRE_MINUTES, authenticate_user, create_access_token, create_user,
    decode_access_token, init_auth_db,
)

init_db()
init_platform_db()
init_auth_db()

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
BEARER_SCHEME = HTTPBearer(auto_error=False)

SESSION_TTL_HOURS = int(os.getenv("SESSION_TTL_HOURS", "24"))
ALLOWED_EXTENSIONS = {".csv", ".xlsx", ".xls"}
MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "50"))

BASE_DIR = os.path.dirname(__file__)
DATA_DIR = os.getenv("AXIO_DATA_DIR", os.path.join(BASE_DIR, "..", "data"))
EXPORTS_DIR = os.getenv("AXIO_EXPORTS_DIR", os.path.join(BASE_DIR, "..", "exports"))
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
    if not api_key or not secrets.compare_digest(api_key, AXIO_API_KEY):
        raise HTTPException(
            status_code=401,
            detail="Invalid or missing API key. Set X-API-Key header.",
            headers={"WWW-Authenticate": "ApiKey"},
        )

# ── Helpers ───────────────────────────────────────────────────────────────────

async def require_auth(request: Request, api_key: str = Depends(API_KEY_HEADER), credentials: HTTPAuthorizationCredentials | None = Depends(BEARER_SCHEME)):
    if AXIO_API_KEY and api_key and secrets.compare_digest(api_key, AXIO_API_KEY):
        request.state.user = {"id": "api-key", "email": "service@axio.local", "name": "API service"}
        return request.state.user
    if credentials and credentials.scheme.lower() == "bearer":
        user = decode_access_token(credentials.credentials)
        if user:
            request.state.user = user
            return user
    raise HTTPException(status_code=401, detail="Authentication required.", headers={"WWW-Authenticate": "Bearer"})


def current_owner(request: Request) -> str:
    return request.state.user["id"]


def _get_session(session_id: str, owner_id: str | None = None) -> dict:
    session = store.get(session_id)
    if session and owner_id and session.get("owner_id") != owner_id:
        raise HTTPException(status_code=403, detail="You do not have access to this session.")
    if session:
        return session

    # Redis is optional in local development. Recover project-backed sessions
    # after a restart when the in-memory fallback has been cleared.
    dataset = get_dataset_by_session(session_id)
    if dataset and owner_id and dataset.get("owner_id") != owner_id:
        raise HTTPException(status_code=403, detail="You do not have access to this session.")
    if dataset:
        safe_name = secure_filename(dataset["filename"] or "upload")
        filepath = os.path.join(DATA_DIR, f"{session_id}_{safe_name}")
        if os.path.exists(filepath):
            session = {
                "session_id": session_id,
                "filepath": filepath,
                "filename": dataset["filename"],
                "analysis": dataset["analysis"],
                "created_at": dataset["created_at"],
                "project_id": dataset["project_id"],
                "owner_id": dataset["owner_id"],
            }
            store.set(session_id, session)
            logger.info(f"Restored session {session_id} from persisted project dataset")
            return session

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


def _chart_for_request(message: str, session: dict) -> list[ChartDisplay]:
    """Create charts from real uploaded values; never invent chart data."""
    text = message.lower()
    if not any(word in text for word in ("chart", "plot", "graph", "visual", "pie", "histogram")):
        return []
    try:
        df = _read_dataframe(session["filepath"])
        target = session.get("analysis", {}).get("recommended_target")
        full_chart = any(term in text for term in (
            "full chart", "full charts", "all charts", "complete chart", "complete charts",
            "full visual", "full visuals", "all visualizations", "complete visualization",
        ))
        charts = []

        if target and target in df.columns:
            counts = df[target].value_counts(dropna=False).head(12)
            charts.append(ChartDisplay(
                type="pie" if ("pie" in text or "pi chart" in text) and not full_chart else "bar",
                title=f"{target} distribution",
                labels=["Missing" if pd.isna(v) else str(v) for v in counts.index],
                values=[float(v) for v in counts.values],
                x_label=target,
                y_label="Rows",
            ))

        if not full_chart:
            return charts

        # A full chart request is intentionally bounded so a wide dataset does
        # not create an unusable wall of charts in the chat transcript.
        missing = df.isna().sum()
        missing = missing[missing > 0].sort_values(ascending=False).head(12)
        if not missing.empty:
            charts.append(ChartDisplay(
                type="bar",
                title="Missing values by column",
                labels=[str(value) for value in missing.index],
                values=[float(value) for value in missing.values],
                x_label="Column",
                y_label="Missing rows",
            ))

        numeric_columns = [column for column in df.select_dtypes(include="number").columns if column != target]
        for column in numeric_columns[:3]:
            values = pd.to_numeric(df[column], errors="coerce").dropna()
            if values.empty or values.nunique() < 2:
                continue
            counts, edges = np.histogram(values, bins=min(8, max(3, values.nunique())))
            labels = [f"{edges[index]:.3g}–{edges[index + 1]:.3g}" for index in range(len(counts))]
            charts.append(ChartDisplay(
                type="histogram",
                title=f"{column} distribution",
                labels=labels,
                values=[float(value) for value in counts],
                x_label=column,
                y_label="Rows",
            ))

        return charts[:5]
    except Exception:
        logger.exception("Could not build chart payload")
        return []


def _is_training_request(message: str) -> bool:
    text = message.lower()
    return any(term in text for term in ("train model", "train the model", "build a model", "fit a model", "train it"))


def _is_feature_stats_request(message: str) -> bool:
    text = message.lower()
    return "feature stat" in text or "column stat" in text or "data stat" in text or "show feature" in text


def _feature_stats_content(session: dict) -> str:
    analysis = session.get("analysis", {})
    features = analysis.get("features", [])
    lines = ["## Feature statistics", "", f"**Dataset:** `{session.get('filename', 'uploaded data')}`", "", "| Feature | Type | Missing | Unique values |", "|---|---|---:|---:|"]
    lines.extend(
        f"| {feature['name']} | {feature['dtype']} | {feature['missing_pct']:.1f}% | {feature['unique_count']} |"
        for feature in features
    )
    missing = sum(1 for feature in features if feature.get("missing_pct", 0) > 0)
    target = analysis.get("recommended_target") or "Not detected"
    lines.extend([
        "", "### Key observations", "",
        f"- **Missing data:** {'Columns require review.' if missing else 'No missing values detected.'}",
        f"- **Recommended target:** `{target}`",
        f"- **Dataset size:** {analysis.get('row_count', 0):,} rows × {analysis.get('col_count', 0)} columns.",
    ])
    return "\n".join(lines)

# ── Routes ────────────────────────────────────────────────────────────────────

@app.post("/auth/register", response_model=AuthResponse, tags=["auth"])
def register(payload: RegisterRequest):
    user = create_user(payload.email, payload.name, payload.password)
    if not user:
        raise HTTPException(status_code=409, detail="An account with this email already exists.")
    return AuthResponse(access_token=create_access_token(user), expires_in=JWT_EXPIRE_MINUTES * 60,
                        user=UserResponse(**user))


@app.post("/auth/login", response_model=AuthResponse, tags=["auth"])
def login(payload: LoginRequest):
    user = authenticate_user(payload.email, payload.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password.", headers={"WWW-Authenticate": "Bearer"})
    return AuthResponse(access_token=create_access_token(user), expires_in=JWT_EXPIRE_MINUTES * 60,
                        user=UserResponse(**user))


@app.get("/auth/me", response_model=UserResponse, tags=["auth"], dependencies=[Depends(require_auth)])
def me(request: Request):
    return UserResponse(**request.state.user)


@app.get("/health", tags=["system"])
def health_check():
    return {
        "status": "ok",
        "sessions_active": store.count(),
        "session_backend": store.backend_name(),
        "auth_enabled": True,
        "jwt_auth": True,
    }


@app.get("/agent-run/{session_id}", tags=["orchestration"],
         dependencies=[Depends(require_auth)])
def agent_run_status(request: Request, session_id: str):
    """Expose the LangGraph-compatible agent state for the workspace UI."""
    return build_agent_run(_get_session(session_id, current_owner(request)))


@app.get("/api/projects", response_model=list[ProjectResponse], tags=["platform"],
         dependencies=[Depends(require_auth)])
def projects_list(request: Request):
    """List projects for the current workspace placeholder.

    X-Workspace-Id is intentionally temporary until user authentication lands.
    """
    owner_id = current_owner(request)
    return list_projects(owner_id)


@app.post("/api/projects", response_model=ProjectResponse, tags=["platform"],
          dependencies=[Depends(require_auth)])
def projects_create(request: Request, payload: ProjectCreate):
    owner_id = current_owner(request)
    return create_project(payload.name, payload.description, owner_id)


@app.get("/api/projects/{project_id}/datasets", response_model=list[DatasetResponse], tags=["platform"],
         dependencies=[Depends(require_auth)])
def project_datasets(request: Request, project_id: str):
    owner_id = current_owner(request)
    if not get_project(project_id, owner_id):
        raise HTTPException(status_code=404, detail="Project not found in this workspace.")
    return list_datasets(project_id, owner_id)


@app.get("/api/projects/{project_id}/runs", response_model=list[RunResponse], tags=["platform"],
         dependencies=[Depends(require_auth)])
def project_runs(request: Request, project_id: str):
    owner_id = current_owner(request)
    if not get_project(project_id, owner_id):
        raise HTTPException(status_code=404, detail="Project not found in this workspace.")
    return list_runs(project_id, owner_id)


@app.post("/upload", response_model=AnalyzeResponse, tags=["data"],
          dependencies=[Depends(require_auth)])
@limiter.limit("30/minute")
async def upload_dataset(request: Request, file: UploadFile = File(...)):
    project_id = request.headers.get("X-Project-Id")
    owner_id = current_owner(request)
    if project_id and not get_project(project_id, owner_id):
        raise HTTPException(status_code=404, detail="Project not found in this workspace.")

    ext = os.path.splitext(file.filename or "")[-1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=415, detail=f"Unsupported file type '{ext}'.")

    session_id = str(uuid.uuid4())
    safe_name = secure_filename(file.filename or "upload")
    filepath = os.path.join(DATA_DIR, f"{session_id}_{safe_name}")

    max_bytes = MAX_UPLOAD_MB * 1024 * 1024
    bytes_written = 0
    try:
        with open(filepath, "wb") as f:
            while chunk := await file.read(1024 * 1024):
                bytes_written += len(chunk)
                if bytes_written > max_bytes:
                    raise HTTPException(status_code=413, detail=f"File exceeds {MAX_UPLOAD_MB} MB limit.")
                f.write(chunk)
    except Exception:
        if os.path.exists(filepath):
            os.remove(filepath)
        raise
    finally:
        await file.close()

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
            "project_id": project_id,
            "owner_id": owner_id,
        })
        if project_id:
            register_dataset(project_id, owner_id, session_id, file.filename or safe_name, analysis)

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
          dependencies=[Depends(require_auth)])
@limiter.limit("60/minute")
def chat_endpoint(request: Request, req: ChatRequest):
    context = _get_session(req.session_id, current_owner(request))
    
    # Save user message
    session_label = context.get("filename", "New Conversation")
    conversation_id = req.conversation_id or req.session_id
    save_message(conversation_id, "user", req.message, session_label=session_label,
                 owner_id=current_owner(request), project_id=context.get("project_id"),
                 dataset_session_id=req.session_id)
    
    response = generate_chat_response(req.message, req.history, context)
    response.charts = _chart_for_request(req.message, context)

    if _is_feature_stats_request(req.message):
        response.content = _feature_stats_content(context)
        response.actions = ["Train Model", "Compare Models", "Show Feature Stats"]
        response.metrics = []

    # Chat can perform the core training action when the user explicitly asks.
    # This uses the same validated pipeline as the Train tab, so metrics and the
    # downloadable artifact always correspond to the actual trained model.
    if _is_training_request(req.message):
        target = context.get("analysis", {}).get("recommended_target")
        if target:
            try:
                result = train_pipeline(req.session_id, _read_dataframe(context["filepath"]), target)
                context["last_train"] = {"model_key": result.get("model_key", result["model_name"]), "problem_type": result["problem_type"], "metrics": result["metrics"].model_dump()}
                store.set(req.session_id, context)
                m = result["metrics"]
                response.content = (
                    f"## Model trained successfully\n\n"
                    f"**Model:** `{result['model_name']}`  \n"
                    f"**Target:** `{target}`  \n"
                    f"**Task:** {result['problem_type']}\n\n"
                    "The metrics below are from a held-out test split. Use the download action to export the trained pipeline."
                )
                response.metrics = [MetricDisplay(label=label, value=f"{value:.4f}") for label, value in (
                    ("Accuracy", m.accuracy), ("F1 Score", m.f1_score), ("Precision", m.precision), ("Recall", m.recall), ("R² Score", m.r2_score)
                ) if value is not None]
                response.actions = ["Download .pkl", "Show feature importance"]
            except Exception as exc:
                logger.exception("Chat-triggered training failed")
                response.content = f"## Training could not be completed\n\n`{exc}`\n\nCheck the target column and data quality, then try again."
                response.actions = ["Review data", "Choose target"]
    
    # Save assistant message
    metrics_dicts = [{"label": m.label, "value": m.value, "delta": m.delta} for m in response.metrics]
    save_message(conversation_id, "assistant", response.content, actions=response.actions,
                 metrics=metrics_dicts, session_label=session_label,
                 owner_id=current_owner(request), project_id=context.get("project_id"),
                 dataset_session_id=req.session_id)
    
    return response

@app.get("/chat/sessions", tags=["ai"], dependencies=[Depends(require_auth)])
def list_sessions(request: Request, project_id: str | None = None):
    return get_sessions(current_owner(request), project_id)

@app.get("/chat/history/{session_id}", tags=["ai"], dependencies=[Depends(require_auth)])
def get_session_history(request: Request, session_id: str):
    return get_history(session_id, current_owner(request))


@app.post("/train", tags=["ml"], dependencies=[Depends(require_auth)])
@limiter.limit("10/minute")
async def train_model(request: Request, req: TrainRequest):
    session = _get_session(req.session_id, current_owner(request))
    df = _read_dataframe(session["filepath"])
    try:
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            _executor,
            lambda: train_pipeline(
                session_id=req.session_id,
                df=df,
                target_column=req.target_column,
                model_key=req.model_key,
                test_size=req.test_size,
                cross_validate=req.cross_validate,
                n_cv_folds=req.n_cv_folds,
            )
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.exception(f"Training failed for session {req.session_id}")
        raise HTTPException(status_code=500, detail=f"Training error: {e}")

    session["last_train"] = {
        "model_key": req.model_key or result.get("model_key"),
        "problem_type": result["problem_type"],
    }
    store.set(req.session_id, session)
    project_id = session.get("project_id")
    if project_id:
        register_run(project_id, session.get("owner_id", "local-workspace"), req.session_id, {
            **result,
            "metrics": result["metrics"].model_dump(),
        })

    logger.info(f"Session {req.session_id} trained '{result['model_name']}' ({result['problem_type']})")
    return result


@app.post("/predict", response_model=PredictResponse, tags=["ml"],
          dependencies=[Depends(require_auth)])
@limiter.limit("120/minute")
def predict(request: Request, req: PredictRequest):
    _get_session(req.session_id, current_owner(request))
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
        raise HTTPException(status_code=422, detail="The supplied values do not match the trained model schema.")


@app.get("/export/model/{session_id}", tags=["export"],
         dependencies=[Depends(require_auth)])
def export_model(request: Request, session_id: str):
    _get_session(session_id, current_owner(request))
    model_path = os.path.join(_exports_dir(session_id), "model.pkl")
    if not os.path.exists(model_path):
        model_path = os.path.join(_exports_dir(session_id), "model.joblib")
    if not os.path.exists(model_path):
        raise HTTPException(status_code=404, detail="Model not found. Train first.")
    return FileResponse(model_path, media_type="application/octet-stream",
                        filename=f"axio_model_{session_id}.pkl")


@app.delete("/session/{session_id}", tags=["system"],
            dependencies=[Depends(require_auth)])
def delete_session(request: Request, session_id: str):
    session = _get_session(session_id, current_owner(request))
    store.delete(session_id)
    if session:
        try:
            fp = session.get("filepath")
            if fp and os.path.exists(fp):
                os.remove(fp)
        except OSError:
            pass
    try:
        exp_dir = _exports_dir(session_id)
        if os.path.exists(exp_dir):
            shutil.rmtree(exp_dir, ignore_errors=True)
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
        if full_path.startswith(("health", "api", "upload", "train", "predict", "chat", "export", "session", "docs")):
            raise HTTPException(status_code=404)
        
        index_file = os.path.join(FRONTEND_DIST, "index.html")
        if os.path.exists(index_file):
            return FileResponse(index_file)
        raise HTTPException(status_code=404, detail="Frontend index.html not found.")
else:
    logger.warning(f"Frontend dist not found at {FRONTEND_DIST}. Static serving disabled.")
