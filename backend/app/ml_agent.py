import os
import json
import json_repair
import logging
from google import genai
from google.genai import types
from dotenv import load_dotenv
from .schemas import ChatResponse, ChatMessage, MetricDisplay, ChartDisplay

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

logger = logging.getLogger(__name__)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

# Max conversation turns to keep (prevents context overflow on long sessions)
MAX_HISTORY_TURNS = 10

client = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY else None

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
  "metrics": [{"label": "Metric Name", "value": "0.94", "delta": "+2%"}],
  "charts": [{"type": "pie", "title": "Chart title", "labels": ["A", "B"], "values": [10, 20]}]
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
    messages = []

    # Inject sanitized context as a system message
    if context_info:
        safe_ctx = _sanitize_context(context_info)
        if safe_ctx:
            ctx_str = (
                "Current session context (use this to give relevant advice):\n"
                + json.dumps(safe_ctx, indent=2)
            )
            messages.append(ctx_str)

    # Truncate history to prevent token overflow
    for h in _truncate_history(history):
        role = h.role if h.role in ("user", "assistant") else (
            "assistant" if h.role == "ai" else "user"
        )
        messages.append(f"{role.upper()}: {h.content}")

    messages.append(f"USER: {message}")

    if not GEMINI_API_KEY or client is None:
        return ChatResponse(
            content="⚠️ **GEMINI_API_KEY is missing.** Please set it in your `backend/.env` file to use the AI assistant.",
            actions=["Show .env Instructions"],
            metrics=[],
        )

    try:
        completion = client.models.generate_content(
            model=GEMINI_MODEL,
            contents="\n\n".join(messages),
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_PROMPT,
                temperature=0.2,
                max_output_tokens=1024,
                response_mime_type="application/json",
            ),
        )

        raw = (completion.text or "").strip()

        # Robustly extract outermost JSON object
        start = raw.find("{")
        end = raw.rfind("}")
        json_str = raw[start: end + 1] if start != -1 and end >= start else raw

        try:
            parsed = json_repair.loads(json_str)

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

            charts: list[ChartDisplay] = []
            for chart in parsed.get("charts", [])[:4]:
                if isinstance(chart, dict) and chart.get("type") in {"pie", "bar", "line", "histogram"}:
                    try:
                        charts.append(ChartDisplay(
                            type=chart["type"],
                            title=str(chart.get("title", "Chart")),
                            labels=[str(v) for v in chart.get("labels", [])],
                            values=[float(v) for v in chart.get("values", [])],
                            x_label=chart.get("x_label"),
                            y_label=chart.get("y_label"),
                        ))
                    except (TypeError, ValueError, KeyError):
                        logger.warning("Ignored malformed chart payload from AI")

            return ChatResponse(
                content=content or "I had trouble formatting my response. Please try again.",
                actions=parsed.get("actions", [])[:4],  # cap at 4 buttons
                metrics=metrics,
                charts=charts,
            )

        except json.JSONDecodeError:
            logger.warning(
                "AI returned non-JSON. Wrapping as plain content. "
                f"Raw (first 200 chars): {raw[:200]}"
            )
            return ChatResponse(content=raw, actions=[], metrics=[])

    except Exception as e:
        logger.error(f"Gemini API error: {e}", exc_info=True)
        return ChatResponse(
            content=f"⚠️ Error contacting AI service: {e}",
            actions=["Retry"],
            metrics=[],
        )
