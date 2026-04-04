"""
Axio ML Platform — Code Exporter
Generates standalone Python scripts from a trained session's metadata.
"""

from typing import Optional


# ── Helpers ────────────────────────────────────────────────────────────────

def _get_model_import(model_key: str, problem_type: str) -> str:
    classification_imports = {
        "random_forest": "from sklearn.ensemble import RandomForestClassifier",
        "gradient_boosting": "from sklearn.ensemble import GradientBoostingClassifier",
        "hist_gradient_boosting": "from sklearn.ensemble import HistGradientBoostingClassifier",
        "logistic_regression": "from sklearn.linear_model import LogisticRegression",
    }
    regression_imports = {
        "random_forest": "from sklearn.ensemble import RandomForestRegressor",
        "gradient_boosting": "from sklearn.ensemble import GradientBoostingRegressor",
        "hist_gradient_boosting": "from sklearn.ensemble import HistGradientBoostingRegressor",
        "linear_regression": "from sklearn.linear_model import LinearRegression",
        "ridge": "from sklearn.linear_model import Ridge",
    }
    table = classification_imports if problem_type == "classification" else regression_imports
    return table.get(model_key, "from sklearn.ensemble import RandomForestClassifier")


def _get_model_class(model_key: str, problem_type: str) -> str:
    classification_classes = {
        "random_forest": "RandomForestClassifier(n_estimators=200, n_jobs=-1, random_state=42)",
        "gradient_boosting": "GradientBoostingClassifier(n_estimators=200, random_state=42)",
        "hist_gradient_boosting": "HistGradientBoostingClassifier(random_state=42)",
        "logistic_regression": "LogisticRegression(max_iter=1000, n_jobs=-1, random_state=42)",
    }
    regression_classes = {
        "random_forest": "RandomForestRegressor(n_estimators=200, n_jobs=-1, random_state=42)",
        "gradient_boosting": "GradientBoostingRegressor(n_estimators=200, random_state=42)",
        "hist_gradient_boosting": "HistGradientBoostingRegressor(random_state=42)",
        "linear_regression": "LinearRegression(n_jobs=-1)",
        "ridge": "Ridge()",
    }
    table = classification_classes if problem_type == "classification" else regression_classes
    return table.get(model_key, "RandomForestClassifier(n_estimators=200, n_jobs=-1, random_state=42)")


# ── Public API ─────────────────────────────────────────────────────────────

def generate_python_script(meta: dict, df_columns: list[str]) -> str:
    """
    Generate a standalone Python training + prediction script.

    Args:
        meta: dict with keys: target_column, model_key, problem_type, test_size
        df_columns: list of all column names in the dataset (for docstring context)
    """
    target = meta.get("target_column", "target")
    model_key = meta.get("model_key", "random_forest")
    problem_type = meta.get("problem_type", "classification")
    test_size = meta.get("test_size", 0.2)

    model_import = _get_model_import(model_key, problem_type)
    model_class = _get_model_class(model_key, problem_type)

    metric_block = (
        """\
    accuracy = accuracy_score(y_test, y_pred)
    f1 = f1_score(y_test, y_pred, average='weighted', zero_division=0)
    print(f"Accuracy : {accuracy:.4f}")
    print(f"F1-score : {f1:.4f}")"""
        if problem_type == "classification"
        else """\
    rmse = np.sqrt(mean_squared_error(y_test, y_pred))
    r2 = r2_score(y_test, y_pred)
    print(f"RMSE : {rmse:.4f}")
    print(f"R²   : {r2:.4f}")"""
    )

    metric_imports = (
        "from sklearn.metrics import accuracy_score, f1_score"
        if problem_type == "classification"
        else "from sklearn.metrics import mean_squared_error, r2_score"
    )

    return f'''\
"""
Axio ML — Auto-generated training script
Model    : {model_key}
Task     : {problem_type}
Target   : {target}
Columns  : {df_columns}
"""

import numpy as np
import pandas as pd
import joblib
from sklearn.pipeline import Pipeline
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler, OneHotEncoder, LabelEncoder
from sklearn.model_selection import train_test_split
{model_import}
{metric_imports}

# ── Load data ──────────────────────────────────────────────────────────────
df = pd.read_csv("your_dataset.csv")   # ← replace with your file path

target_column = "{target}"
y = df[target_column]
X = df.drop(columns=[target_column])

# ── Preprocessing ──────────────────────────────────────────────────────────
numeric_features = X.select_dtypes(include=["int64", "float64"]).columns.tolist()
categorical_features = X.select_dtypes(include=["object", "category", "bool"]).columns.tolist()

numeric_transformer = Pipeline([
    ("imputer", SimpleImputer(strategy="median")),
    ("scaler", StandardScaler()),
])
categorical_transformer = Pipeline([
    ("imputer", SimpleImputer(strategy="most_frequent")),
    ("onehot", OneHotEncoder(handle_unknown="ignore", sparse_output=False)),
])
preprocessor = ColumnTransformer([
    ("num", numeric_transformer, numeric_features),
    ("cat", categorical_transformer, categorical_features),
], n_jobs=-1)

# ── Encode target (classification only) ────────────────────────────────────
label_encoder = None
{"if y.dtype == object:" if problem_type == "classification" else "# (regression — no label encoding needed)"}
{"    label_encoder = LabelEncoder()" if problem_type == "classification" else ""}
{"    y = pd.Series(label_encoder.fit_transform(y), index=y.index)" if problem_type == "classification" else ""}

# ── Model ──────────────────────────────────────────────────────────────────
model = {model_class}

pipeline = Pipeline([
    ("preprocessor", preprocessor),
    ("model", model),
])

# ── Train / test split ─────────────────────────────────────────────────────
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size={test_size}, random_state=42
)

pipeline.fit(X_train, y_train)

# ── Evaluate ───────────────────────────────────────────────────────────────
y_pred = pipeline.predict(X_test)
{metric_block}

# ── Save ───────────────────────────────────────────────────────────────────
joblib.dump(pipeline, "model.joblib", compress=3)
if label_encoder:
    joblib.dump(label_encoder, "target_encoder.joblib", compress=3)
print("Model saved to model.joblib")
'''


def generate_fastapi_script(meta: dict, df_columns: list[str]) -> str:
    """
    Generate a production-ready FastAPI REST API script.

    Args:
        meta: dict with keys: target_column, model_key, problem_type
        df_columns: list of feature column names (excluding target)
    """
    target = meta.get("target_column", "target")
    model_key = meta.get("model_key", "random_forest")
    problem_type = meta.get("problem_type", "classification")

    feature_columns = [c for c in df_columns if c != target]
    feature_fields = "\n    ".join(f'{col}: float  # adjust type if needed' for col in feature_columns[:20])

    return f'''\
"""
Axio ML — Auto-generated FastAPI inference server
Model    : {model_key}
Task     : {problem_type}
Target   : {target}

Run with:
    pip install fastapi uvicorn joblib pandas scikit-learn
    uvicorn app:app --reload
"""

from contextlib import asynccontextmanager
from typing import Optional, Dict, Any

import joblib
import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel


# ── Schemas ────────────────────────────────────────────────────────────────
class PredictRequest(BaseModel):
    {feature_fields if feature_fields else "# add your feature fields here\n    feature_1: float"}


class PredictResponse(BaseModel):
    prediction: Any
    confidence: Optional[float] = None
    probabilities: Optional[Dict[str, float]] = None


# ── Startup / shutdown ─────────────────────────────────────────────────────
model = None
label_encoder = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global model, label_encoder
    model = joblib.load("model.joblib")
    try:
        label_encoder = joblib.load("target_encoder.joblib")
    except FileNotFoundError:
        label_encoder = None
    print("✅ Model loaded successfully")
    yield
    print("👋 Shutting down")


# ── App ────────────────────────────────────────────────────────────────────
app = FastAPI(title="Axio ML Inference API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Routes ─────────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {{"status": "ok", "model_loaded": model is not None}}


@app.get("/model/info")
def model_info():
    return {{
        "model_key": "{model_key}",
        "problem_type": "{problem_type}",
        "target": "{target}",
        "features": {feature_columns[:20]},
    }}


@app.post("/predict", response_model=PredictResponse)
def predict(req: PredictRequest):
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded.")
    
    input_df = pd.DataFrame([req.model_dump()])
    
    try:
        prediction_raw = model.predict(input_df)[0]
        
        probabilities = None
        confidence = None
        model_step = model.named_steps.get("model")
        if model_step and hasattr(model_step, "predict_proba"):
            probs = model.predict_proba(input_df)[0]
            confidence = float(probs.max())
            if label_encoder is not None:
                probabilities = {{str(c): float(p) for c, p in zip(label_encoder.classes_, probs)}}
            else:
                probabilities = {{str(i): float(p) for i, p in enumerate(probs)}}
        
        if label_encoder is not None:
            prediction_raw = label_encoder.inverse_transform([prediction_raw])[0]
        
        # Serialise numpy types
        if isinstance(prediction_raw, (np.integer,)):
            prediction_raw = int(prediction_raw)
        elif isinstance(prediction_raw, (np.floating,)):
            prediction_raw = float(prediction_raw)
        
        return PredictResponse(
            prediction=prediction_raw,
            confidence=confidence,
            probabilities=probabilities,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
'''