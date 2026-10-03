import time
import pandas as pd
import numpy as np
import joblib
import os
import logging
import gc
from typing import Optional
from sklearn.pipeline import Pipeline
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler, OneHotEncoder, LabelEncoder
from sklearn.model_selection import train_test_split, cross_val_score, StratifiedKFold, KFold
from sklearn.ensemble import (
    RandomForestClassifier, RandomForestRegressor,
    GradientBoostingClassifier, GradientBoostingRegressor,
    HistGradientBoostingClassifier, HistGradientBoostingRegressor,  # NEW: faster & better
)
from sklearn.linear_model import LogisticRegression, LinearRegression, Ridge  # NEW: Ridge
from sklearn.metrics import (
    accuracy_score, f1_score, precision_score, recall_score,
    roc_auc_score, mean_squared_error, mean_absolute_error, r2_score, confusion_matrix
)
from .schemas import MetricSet

logger = logging.getLogger(__name__)
EXPORTS_DIR = os.getenv(
    "AXIO_EXPORTS_DIR",
    os.path.join(os.path.dirname(__file__), "..", "exports"),
)

# ---------------------------------------------------------------------------
# Model Mappings — HistGradientBoosting added: natively handles NaN,
# supports missing values, much faster on large datasets
# ---------------------------------------------------------------------------
CLASSIFIERS = {
    "random_forest": lambda: RandomForestClassifier(n_estimators=200, n_jobs=-1, random_state=42),
    "gradient_boosting": lambda: GradientBoostingClassifier(n_estimators=200, random_state=42),
    "hist_gradient_boosting": lambda: HistGradientBoostingClassifier(random_state=42),  # NEW
    "logistic_regression": lambda: LogisticRegression(max_iter=1000, n_jobs=-1, random_state=42),
}

REGRESSORS = {
    "random_forest": lambda: RandomForestRegressor(n_estimators=200, n_jobs=-1, random_state=42),
    "gradient_boosting": lambda: GradientBoostingRegressor(n_estimators=200, random_state=42),
    "hist_gradient_boosting": lambda: HistGradientBoostingRegressor(random_state=42),  # NEW
    "linear_regression": lambda: LinearRegression(n_jobs=-1),
    "ridge": lambda: Ridge(random_state=42),  # NEW: regularized, avoids overfitting
}

# Columns we never want as a target
_ID_LIKE_PATTERNS = {"id", "uuid", "key", "index", "row"}


def _is_likely_id_column(col: str, series: pd.Series) -> bool:
    """Heuristic: column is probably a row-id or key."""
    col_lower = col.lower()
    if any(p in col_lower for p in _ID_LIKE_PATTERNS):
        return True
    # Nearly all unique + numeric sequential
    if series.dtype in [np.int64, np.float64]:
        if series.nunique() == len(series):
            diffs = series.sort_values().diff().dropna()
            if (diffs == 1).mean() > 0.9:
                return True
    return False


def _is_string_target(y: pd.Series) -> bool:
    """Return True if y contains non-numeric text data (robust to pandas 3.x dtypes)."""
    if y.dtype == object or y.dtype.name in ("category", "bool", "string"):
        return True
    if pd.api.types.is_string_dtype(y) and not pd.api.types.is_numeric_dtype(y):
        return True
    # Check actual values if dtype is ambiguous
    sample = y.dropna().head(10)
    if len(sample) > 0 and sample.apply(lambda v: isinstance(v, str)).any():
        return True
    return False


def _infer_problem_type(y: pd.Series) -> str:
    """
    Smarter problem-type detection:
    - string/object/bool/category → classification
    - numeric with ≤15 unique values AND integer-like → classification
    - otherwise → regression
    """
    if _is_string_target(y):
        return "classification"
    if pd.api.types.is_integer_dtype(y) and y.nunique() <= 15:
        return "classification"
    if pd.api.types.is_float_dtype(y):
        # Float but only whole numbers and few unique → classification
        if y.nunique() <= 10 and (y == y.round()).all():
            return "classification"
    return "regression"


def _recommend_target(df: pd.DataFrame) -> Optional[str]:
    """Return the most likely target column name."""
    target_hints = {"target", "label", "class", "outcome", "result", "survived",
                    "churn", "default", "fraud", "price", "salary", "score"}
    for col in df.columns:
        if col.lower() in target_hints:
            return col
    # Last column heuristic (common in kaggle datasets)
    last = df.columns[-1]
    if not _is_likely_id_column(last, df[last]):
        return last
    return None


def analyze_dataset_pipeline(df: pd.DataFrame) -> dict:
    recommended_target = _recommend_target(df)
    features = []
    for col in df.columns:
        is_likely_target = col == recommended_target
        features.append({
            "name": col,
            "dtype": str(df[col].dtype),
            "missing_pct": round(df[col].isnull().mean() * 100, 2),
            "unique_count": int(df[col].nunique()),
            "sample_values": df[col].dropna().head(3).tolist(),
            "is_likely_target": is_likely_target,
        })
    numeric_summary = {}
    for col in df.select_dtypes(include="number").columns[:30]:
        series = df[col].dropna()
        numeric_summary[col] = {
            "min": float(series.min()) if not series.empty else None,
            "max": float(series.max()) if not series.empty else None,
            "mean": float(series.mean()) if not series.empty else None,
            "std": float(series.std()) if len(series) > 1 else 0.0,
        }
    missing_cells = int(df.isna().sum().sum())
    constant_columns = [str(col) for col in df.columns if df[col].nunique(dropna=False) <= 1]
    warnings = []
    if missing_cells:
        warnings.append(f"{missing_cells:,} missing cells require review.")
    if constant_columns:
        warnings.append(f"Constant columns detected: {', '.join(constant_columns[:8])}.")
    if len(df) < 30:
        warnings.append("Small dataset: evaluation metrics may be unstable.")
    return {
        "row_count": len(df),
        "col_count": len(df.columns),
        "features": features,
        "recommended_target": recommended_target,
        "profile": {
            "duplicate_rows": int(df.duplicated().sum()),
            "missing_cells": missing_cells,
            "missing_by_column": {str(k): int(v) for k, v in df.isna().sum().items() if v},
            "constant_columns": constant_columns,
            "numeric_summary": numeric_summary,
            "warnings": warnings,
        },
    }


def _coerce_dtypes(X: pd.DataFrame) -> pd.DataFrame:
    """
    Coerce dtypes to make preprocessing robust:
    - bool columns → int (avoids OneHotEncoder issues)
    - object columns that are fully numeric → float
    """
    X = X.copy()
    for col in X.columns:
        if X[col].dtype == bool or X[col].dtype.name == "bool":
            X[col] = X[col].astype(int)
        elif X[col].dtype == object:
            coerced = pd.to_numeric(X[col], errors="coerce")
            if coerced.notna().sum() / max(len(coerced), 1) > 0.9:
                X[col] = coerced
    return X


def _build_preprocessor(X: pd.DataFrame):
    """Build a ColumnTransformer that handles numeric and categorical features."""
    numeric_features = X.select_dtypes(include=["number"]).columns.tolist()
    all_categorical_features = X.select_dtypes(include=["object", "category"]).columns.tolist()

    categorical_features = []
    for col in all_categorical_features:
        if X[col].nunique() <= 100:
            categorical_features.append(col)
        else:
            logger.info(f"Dropping high cardinality categorical feature: {col} (>100 unique values)")

    transformers = []

    if numeric_features:
        numeric_transformer = Pipeline(steps=[
            ("imputer", SimpleImputer(strategy="median")),
            ("scaler", StandardScaler()),
        ])
        transformers.append(("num", numeric_transformer, numeric_features))

    if categorical_features:
        categorical_transformer = Pipeline(steps=[
            ("imputer", SimpleImputer(strategy="most_frequent")),
            ("onehot", OneHotEncoder(handle_unknown="ignore", sparse_output=False, dtype=np.float32)),
        ])
        transformers.append(("cat", categorical_transformer, categorical_features))

    preprocessor = ColumnTransformer(
        transformers=transformers,
        remainder="drop",      # safely drop any leftover unexpected types
        n_jobs=-1,             # parallel preprocessing
    )
    return preprocessor, numeric_features, categorical_features


def _get_feature_names(clf: Pipeline, numeric_features: list, categorical_features: list) -> list:
    """Safely extract feature names after preprocessing."""
    names = list(numeric_features)
    try:
        ohe = clf.named_steps["preprocessor"].named_transformers_["cat"].named_steps["onehot"]
        names += list(ohe.get_feature_names_out(categorical_features))
    except (KeyError, AttributeError):
        pass
    return names


def train_pipeline(
    session_id: str,
    df: pd.DataFrame,
    target_column: str,
    model_key: str = None,
    test_size: float = 0.2,
    cross_validate: bool = False,
    n_cv_folds: int = 5,
) -> dict:
    if target_column not in df.columns:
        raise ValueError(f"Target column '{target_column}' not found. Available: {list(df.columns)}")

    if df.empty or len(df) < 2:
        raise ValueError("The dataset must contain at least 2 rows.")
    if df[target_column].isna().any():
        raise ValueError(f"Target column '{target_column}' contains missing values. Remove or fill them before training.")

    # ── Drop ID-like columns silently ──────────────────────────────────────
    candidate_drop = [c for c in df.columns if c != target_column and _is_likely_id_column(c, df[c])]
    # Never remove every predictor. A single sequential numeric feature can be
    # a legitimate measurement, not an ID.
    cols_to_drop = candidate_drop if len(candidate_drop) < len(df.columns) - 1 else []
    if cols_to_drop:
        logger.info(f"Dropping ID-like columns: {cols_to_drop}")
        df = df.drop(columns=cols_to_drop)

    y = df[target_column]
    X = df.drop(columns=[target_column])

    if X.shape[1] == 0:
        raise ValueError("The dataset must contain at least one feature column besides the target.")

    # Coerce dtypes: bool → int, fully-numeric objects → float
    X = _coerce_dtypes(X)

    problem_type = _infer_problem_type(y)
    model_key = model_key or "random_forest"

    # ── Encode target ──────────────────────────────────────────────────────
    label_encoder = None
    if problem_type == "classification" and _is_string_target(y):
        label_encoder = LabelEncoder()
        y = pd.Series(label_encoder.fit_transform(y.astype(str)), index=y.index)

    # ── Train/test split ───────────────────────────────────────────────────
    stratify = y if problem_type == "classification" and y.nunique() <= 20 else None
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=test_size, random_state=42, stratify=stratify
    )

    # Drop columns with >80% missing (based on X_train to prevent data leakage)
    high_missing = [c for c in X_train.columns if X_train[c].isnull().mean() > 0.8]
    if high_missing:
        logger.info(f"Dropping high-missing columns (>80%): {high_missing}")
        X_train = X_train.drop(columns=high_missing)
        X_test = X_test.drop(columns=high_missing)
        X = X.drop(columns=high_missing)  # for cv_scores later

    if X_train.shape[1] == 0:
        raise ValueError("All feature columns are unusable after missing-value filtering.")

    # ── Build pipeline ─────────────────────────────────────────────────────
    preprocessor, numeric_features, categorical_features = _build_preprocessor(X_train)

    if problem_type == "classification":
        model_factory = CLASSIFIERS.get(model_key, CLASSIFIERS["random_forest"])
    else:
        model_factory = REGRESSORS.get(model_key, REGRESSORS["random_forest"])

    model_instance = model_factory()

    clf = Pipeline(steps=[
        ("preprocessor", preprocessor),
        ("model", model_instance),
    ])

    t0 = time.perf_counter()
    clf.fit(X_train, y_train)
    training_time = round(time.perf_counter() - t0, 3)

    # ── Export ─────────────────────────────────────────────────────────────
    exports_dir = os.path.join(EXPORTS_DIR, session_id)
    os.makedirs(exports_dir, exist_ok=True)
    # Keep both extensions: .pkl is the portable artifact users expect, while
    # model.joblib remains for backwards-compatible prediction/loading.
    joblib.dump(clf, os.path.join(exports_dir, "model.pkl"), compress=3)
    joblib.dump(clf, os.path.join(exports_dir, "model.joblib"), compress=3)
    if label_encoder:
        joblib.dump(label_encoder, os.path.join(exports_dir, "target_encoder.joblib"), compress=3)

    # ── Metrics ────────────────────────────────────────────────────────────
    y_pred = clf.predict(X_test)
    metrics = MetricSet(training_time_seconds=training_time)

    if problem_type == "classification":
        metrics.accuracy = float(accuracy_score(y_test, y_pred))
        metrics.f1_score = float(f1_score(y_test, y_pred, average="weighted", zero_division=0))
        metrics.precision = float(precision_score(y_test, y_pred, average="weighted", zero_division=0))
        metrics.recall = float(recall_score(y_test, y_pred, average="weighted", zero_division=0))
        metrics.confusion_matrix = confusion_matrix(y_test, y_pred).tolist()

        if hasattr(clf.named_steps["model"], "predict_proba"):
            try:
                n_classes = len(np.unique(y))
                if n_classes == 2:
                    y_prob = clf.predict_proba(X_test)[:, 1]
                    metrics.auc_roc = float(roc_auc_score(y_test, y_prob))
                else:
                    y_prob = clf.predict_proba(X_test)
                    metrics.auc_roc = float(roc_auc_score(y_test, y_prob, multi_class="ovr", average="weighted"))
            except Exception as e:
                logger.warning(f"AUC-ROC could not be computed: {e}")

        if cross_validate:
            cv = StratifiedKFold(n_splits=n_cv_folds, shuffle=True, random_state=42)
            cv_scores = cross_val_score(clf, X, y, cv=cv, scoring="f1_weighted", n_jobs=-1)
            metrics.cv_scores = [round(float(s), 4) for s in cv_scores]
            metrics.cv_mean = round(float(cv_scores.mean()), 4)
            metrics.cv_std = round(float(cv_scores.std()), 4)

    else:
        metrics.rmse = float(np.sqrt(mean_squared_error(y_test, y_pred)))
        metrics.mae = float(mean_absolute_error(y_test, y_pred))   # NEW
        metrics.r2_score = float(r2_score(y_test, y_pred))

        if cross_validate:
            cv = KFold(n_splits=n_cv_folds, shuffle=True, random_state=42)
            cv_scores = cross_val_score(clf, X, y, cv=cv, scoring="r2", n_jobs=-1)
            metrics.cv_scores = [round(float(s), 4) for s in cv_scores]
            metrics.cv_mean = round(float(cv_scores.mean()), 4)
            metrics.cv_std = round(float(cv_scores.std()), 4)

    # ── Feature importance ─────────────────────────────────────────────────
    if hasattr(clf.named_steps["model"], "feature_importances_"):
        importances = clf.named_steps["model"].feature_importances_
        feature_names = _get_feature_names(clf, numeric_features, categorical_features)
        if len(feature_names) == len(importances):
            fi_dict = dict(zip(feature_names, importances.tolist()))
            metrics.feature_importance = dict(
                sorted(fi_dict.items(), key=lambda x: x[1], reverse=True)[:10]
            )

    # ── Cleanup ────────────────────────────────────────────────────────────
    del df
    del X
    del y
    del X_train
    del X_test
    gc.collect()

    return {
        "model_name": model_key,
        "problem_type": problem_type,
        "metrics": metrics,
        "feature_importances": metrics.feature_importance or {},
        "message": "Training successful",
        "has_label_encoder": label_encoder is not None,
        "dropped_columns": cols_to_drop + high_missing,
    }

