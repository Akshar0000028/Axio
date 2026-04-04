import os
import json
import logging
from openai import OpenAI
from dotenv import load_dotenv
from .schemas import ChatResponse, ChatMessage, MetricDisplay

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

logger = logging.getLogger(__name__)

NVIDIA_API_KEY = os.getenv("NVIDIA_API_KEY", "")
NVIDIA_NIM_MODEL = os.getenv("NVIDIA_NIM_MODEL", "nvidia/nemotron-3-super-120b-a12b")

# Max conversation turns to keep (prevents context overflow on long sessions)
MAX_HISTORY_TURNS = 10

client = OpenAI(
    base_url="https://integrate.api.nvidia.com/v1",
    api_key=NVIDIA_API_KEY,
    timeout=90.0,
)

SYSTEM_PROMPT = """You are Axio ML Assistant, an expert-level AI Data Scientist and Machine Learning Engineer.

Your role is to:
- Analyze datasets
- Help users select the correct target column
- Recommend the best ML model
- Explain model performance and results clearly
- Guide users step-by-step like a senior ML expert

You MUST ALWAYS respond ONLY in valid JSON with the following schema:

{
  "content": "<markdown-formatted response>",
  "actions": ["Short Action Label"],
  "metrics": [{"label": "Metric Name", "value": "0.94", "delta": "+2%"}]
}

----------------------------------------
🔒 STRICT OUTPUT RULES (CRITICAL)
----------------------------------------
1. Output ONLY valid JSON. No extra text, no explanations outside JSON.
2. Ensure JSON is properly formatted and parsable.
3. Escape all newlines as \\n inside "content".
4. Do NOT include trailing commas.
5. Always include all three keys: content, actions, metrics.
6. If no actions or metrics → return empty arrays [].

----------------------------------------
🧠 RESPONSE GUIDELINES
----------------------------------------

### 1. CONTENT (Markdown)
- Use clean markdown:
  - Headers (##, ###)
  - Bullet points
  - Bold for key insights
  - Code blocks with language (```python)
- Keep explanations concise but insightful
- Always provide reasoning behind suggestions
- Use a structured flow:
  1. Dataset understanding
  2. Target column suggestion (if needed)
  3. Recommended model
  4. Why this model
  5. Next steps

### 2. MODEL SELECTION LOGIC
Choose models intelligently:

- Classification:
  → logistic_regression (simple baseline)
  → random_forest (robust default)
  → gradient_boosting (better accuracy)
  → hist_gradient_boosting (large datasets, fastest)

- Regression:
  → linear_regression (baseline)
  → ridge (handles multicollinearity)
  → random_forest / gradient_boosting (non-linear patterns)

Always briefly justify:
- dataset size
- feature types
- complexity

### 3. ACTIONS (UI Buttons)
Provide 1–4 relevant actions such as:
- "Train Model"
- "Auto Select Target"
- "Compare Models"
- "Show Feature Importance"
- "Clean Data"
- "Optimize Hyperparameters"

Rules:
- Keep labels SHORT (2–4 words)
- Only include useful next steps

### 4. METRICS
Include metrics ONLY when relevant:
- Classification → Accuracy, F1 Score, Precision, Recall
- Regression → R² Score, MAE, RMSE

Format:
{
  "label": "Accuracy",
  "value": "0.94",
  "delta": "+2%"
}

- Use realistic values (not random nonsense)
- If no model trained yet → return []

----------------------------------------
⚡ BEHAVIOR RULES
----------------------------------------
- Never hallucinate dataset columns if not provided
- Ask for clarification via actions if needed
- Prefer practical recommendations over theory
- Think like a SaaS ML product (Akkio-style UX)
- Be confident, concise, and helpful

----------------------------------------
🎯 GOAL
----------------------------------------
Act like a production-grade ML copilot that helps users go from raw data → trained model → insights with minimal friction.
"""


def _sanitize_context(context: dict) -> dict:
    """
    Strip sensitive / oversized fields before injecting into LLM context.
    - Remove filepath (security: reveals server paths)
    - Truncate sample_values lists
    - Truncate analysis to essential fields only
    """
    if not context:
        return {}
    safe = {
        "session_id": context.get("session_id"),
        "filename": context.get("filename"),
    }
    analysis = context.get("analysis", {})
    if analysis:
        safe["row_count"] = analysis.get("row_count")
        safe["col_count"] = analysis.get("col_count")
        # Only keep name, dtype, missing_pct, unique_count — skip sample_values (can be huge)
        features = analysis.get("features", [])
        safe["features"] = [
            {k: v for k, v in f.items() if k != "sample_values"}
            for f in features[:50]   # cap at 50 columns
        ]
        safe["recommended_target"] = analysis.get("recommended_target")
    return safe


def _truncate_history(history: list[ChatMessage]) -> list[ChatMessage]:
    """Keep only the most recent MAX_HISTORY_TURNS turns."""
    return history[-MAX_HISTORY_TURNS:] if len(history) > MAX_HISTORY_TURNS else history


def generate_chat_response(
    message: str,
    history: list[ChatMessage],
    context_info: dict = None,
) -> ChatResponse:
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]

    # Inject sanitized context as a system message
    if context_info:
        safe_ctx = _sanitize_context(context_info)
        if safe_ctx:
            ctx_str = (
                "Current session context (use this to give relevant advice):\n"
                + json.dumps(safe_ctx, indent=2)
            )
            messages.append({"role": "system", "content": ctx_str})

    # Truncate history to prevent token overflow
    for h in _truncate_history(history):
        role = h.role if h.role in ("user", "assistant") else (
            "assistant" if h.role == "ai" else "user"
        )
        messages.append({"role": role, "content": h.content})

    messages.append({"role": "user", "content": message})

    if not NVIDIA_API_KEY:
        return ChatResponse(
            content="⚠️ **NVIDIA_API_KEY is missing.** Please set it in your `backend/.env` file to use the AI assistant.",
            actions=["Show .env Instructions"],
            metrics=[],
        )

    try:
        completion = client.chat.completions.create(
            model=NVIDIA_NIM_MODEL,
            messages=messages,
            temperature=0.2,   # lower = more reliable JSON
            max_tokens=1024,
        )

        raw = completion.choices[0].message.content.strip()

        # Robustly extract outermost JSON object
        start = raw.find("{")
        end = raw.rfind("}")
        json_str = raw[start: end + 1] if start != -1 and end >= start else raw

        try:
            parsed = json.loads(json_str)

            # Fix double-escaped newlines that some models emit
            content = parsed.get("content", "")
            if isinstance(content, str):
                content = content.replace("\\n", "\n")

            # Parse metrics — support both old List[str] and new List[dict] format
            raw_metrics = parsed.get("metrics", [])
            metrics: list[MetricDisplay] = []
            for m in raw_metrics:
                if isinstance(m, dict):
                    metrics.append(MetricDisplay(
                        label=m.get("label", ""),
                        value=str(m.get("value", "")),
                        delta=m.get("delta"),
                    ))
                elif isinstance(m, str):
                    # backwards-compat: treat plain string as label
                    metrics.append(MetricDisplay(label=m, value=""))

            return ChatResponse(
                content=content or "I had trouble formatting my response. Please try again.",
                actions=parsed.get("actions", [])[:4],  # cap at 4 buttons
                metrics=metrics,
            )

        except json.JSONDecodeError:
            logger.warning(
                "AI returned non-JSON. Wrapping as plain content. "
                f"Raw (first 200 chars): {raw[:200]}"
            )
            return ChatResponse(content=raw, actions=[], metrics=[])

    except Exception as e:
        logger.error(f"Nvidia API error: {e}", exc_info=True)
        return ChatResponse(
            content=f"⚠️ Error contacting AI service: {e}",
            actions=["Retry"],
            metrics=[],
        )