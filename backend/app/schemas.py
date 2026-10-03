from typing import List, Dict, Any, Optional, Literal
from pydantic import BaseModel, field_validator, model_validator


class FeatureInfo(BaseModel):
    name: str
    dtype: str
    missing_pct: float
    unique_count: int
    sample_values: List[Any]
    is_likely_target: bool = False  # NEW: hint for UI


class ModelRecommendation(BaseModel):
    model_name: str
    reason: str
    confidence: float


class AnalyzeResponse(BaseModel):
    session_id: str
    filename: str
    row_count: int
    col_count: int  # NEW
    features: List[FeatureInfo]
    recommended_target: Optional[str] = None
    problem_type: Optional[str] = None
    recommendations: List[ModelRecommendation] = []


class TrainRequest(BaseModel):
    session_id: str
    target_column: str
    model_key: Optional[str] = None
    test_size: float = 0.2
    cross_validate: bool = False   # NEW: optional CV
    n_cv_folds: int = 5            # NEW

    @field_validator("test_size")
    @classmethod
    def validate_test_size(cls, v: float) -> float:
        if not (0.05 <= v <= 0.5):
            raise ValueError("test_size must be between 0.05 and 0.5")
        return v

    @field_validator("n_cv_folds")
    @classmethod
    def validate_folds(cls, v: int) -> int:
        if not (2 <= v <= 10):
            raise ValueError("n_cv_folds must be between 2 and 10")
        return v


class MetricSet(BaseModel):
    # Classification
    accuracy: Optional[float] = None
    f1_score: Optional[float] = None
    precision: Optional[float] = None
    recall: Optional[float] = None
    auc_roc: Optional[float] = None
    confusion_matrix: Optional[List[List[int]]] = None
    # Regression
    rmse: Optional[float] = None
    mae: Optional[float] = None        # NEW
    r2_score: Optional[float] = None
    # Shared
    feature_importance: Optional[Dict[str, float]] = None
    cv_scores: Optional[List[float]] = None       # NEW
    cv_mean: Optional[float] = None               # NEW
    cv_std: Optional[float] = None                # NEW
    training_time_seconds: Optional[float] = None  # NEW


class TrainResponse(BaseModel):
    session_id: str
    model_name: str
    problem_type: str
    metrics: MetricSet
    message: str


class PredictRequest(BaseModel):
    session_id: str
    features: Dict[str, Any]

    @field_validator("features")
    @classmethod
    def features_not_empty(cls, v: dict) -> dict:
        if not v:
            raise ValueError("features dict cannot be empty")
        return v


class PredictResponse(BaseModel):
    prediction: Any
    confidence: Optional[float] = None
    probabilities: Optional[Dict[str, float]] = None


class ChatMessage(BaseModel):
    role: Literal["user", "assistant", "ai"]
    content: str

    @field_validator("content")
    @classmethod
    def content_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Message content cannot be empty")
        return v


class ChatRequest(BaseModel):
    session_id: str
    message: str
    history: List[ChatMessage] = []
    conversation_id: Optional[str] = None

    @field_validator("message")
    @classmethod
    def message_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Message cannot be empty")
        return v.strip()


class MetricDisplay(BaseModel):
    label: str
    value: str
    delta: Optional[str] = None


class ChartDisplay(BaseModel):
    """Small, renderer-friendly chart payload returned by the ML copilot."""
    type: Literal["pie", "bar", "line", "histogram"]
    title: str
    labels: List[str] = []
    values: List[float] = []
    x_label: Optional[str] = None
    y_label: Optional[str] = None


class ChatResponse(BaseModel):
    content: str
    actions: List[str] = []
    metrics: List[MetricDisplay] = []   # FIXED: was List[str], now structured
    charts: List[ChartDisplay] = []


class ProjectCreate(BaseModel):
    name: str
    description: str = ""

    @field_validator("name")
    @classmethod
    def name_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Project name cannot be empty")
        return v.strip()[:120]


class ProjectResponse(ProjectCreate):
    id: str
    owner_id: str
    created_at: str
    updated_at: str


class DatasetResponse(BaseModel):
    id: str
    project_id: str
    owner_id: str
    session_id: str
    filename: str
    row_count: int
    col_count: int
    analysis: Dict[str, Any]
    created_at: str


class RunResponse(BaseModel):
    id: str
    project_id: str
    owner_id: str
    session_id: str
    model_name: str
    problem_type: str
    metrics: Dict[str, Any]
    created_at: str


class RegisterRequest(BaseModel):
    email: str
    name: str
    password: str

    @field_validator("email")
    @classmethod
    def valid_email(cls, v: str) -> str:
        value = v.strip().lower()
        if "@" not in value or len(value) > 254:
            raise ValueError("A valid email address is required")
        return value

    @field_validator("name")
    @classmethod
    def valid_name(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Name is required")
        return v.strip()[:120]

    @field_validator("password")
    @classmethod
    def valid_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class LoginRequest(BaseModel):
    email: str
    password: str


class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    created_at: str


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserResponse
