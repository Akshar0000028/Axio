"""Small, provider-agnostic orchestration layer for the Axio agent graph.

The ML pipeline remains the source of truth for training. This module gives the
API and UI a stable representation of the reasoning stages around that pipeline
so a future queue worker can execute each stage independently.
"""

from datetime import datetime


AGENT_GRAPH = [
    {"id": "dataset", "name": "Dataset agent", "kind": "agent", "tool": "profile_dataset"},
    {"id": "planning", "name": "Planning agent", "kind": "agent", "tool": "plan_experiments"},
    {"id": "preprocessing", "name": "Preprocessing", "kind": "tool", "tool": "build_preprocessor"},
    {"id": "features", "name": "Feature engineering", "kind": "tool", "tool": "engineer_features"},
    {"id": "experiment", "name": "Experiment agent", "kind": "agent", "tool": "train_candidates"},
    {"id": "evaluation", "name": "Evaluation agent", "kind": "agent", "tool": "evaluate_candidates"},
    {"id": "selection", "name": "Model selection", "kind": "tool", "tool": "select_best_model"},
    {"id": "registry", "name": "Model registry", "kind": "tool", "tool": "register_model"},
    {"id": "deployment", "name": "Deployment agent", "kind": "agent", "tool": "prepare_deployment"},
]


def build_agent_run(session: dict) -> dict:
    """Return an inspectable run graph from the current session state."""
    analysis = session.get("analysis", {})
    trained = session.get("last_train")
    completed = {"dataset"} if analysis else set()
    if trained:
        completed.update({"planning", "preprocessing", "features", "experiment", "evaluation", "selection", "registry", "deployment"})

    stages = []
    for node in AGENT_GRAPH:
        state = "completed" if node["id"] in completed else "queued"
        stages.append({**node, "state": state})

    return {
        "session_id": session.get("session_id"),
        "status": "completed" if trained else ("ready" if analysis else "waiting_for_dataset"),
        "reasoning_model": "gemini",
        "queue": "redis" if session.get("queue_backend") == "redis" else "local",
        "updated_at": datetime.utcnow().isoformat(),
        "stages": stages,
    }
