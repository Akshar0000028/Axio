import io
import os
import tempfile

from fastapi.testclient import TestClient

from app import database, main, pipeline, platform_store


def run():
    root = tempfile.mkdtemp(prefix="axio-smoke-")
    main.DATA_DIR = root
    main.EXPORTS_DIR = os.path.join(root, "exports")
    os.makedirs(main.EXPORTS_DIR)
    pipeline.EXPORTS_DIR = main.EXPORTS_DIR
    platform_store.DB_PATH = os.path.join(root, "platform.db")
    database.DB_PATH = os.path.join(root, "chat.db")
    platform_store.init_platform_db()
    database.init_db()
    client = TestClient(main.app)

    project = client.post("/api/projects", json={"name": "Test Project"})
    assert project.status_code == 200, project.text
    project_id = project.json()["id"]
    assert client.get("/api/projects", headers={"X-Workspace-Id": "other"}).json() == []
    missing_project = client.post(
        "/upload",
        headers={"X-Project-Id": "missing"},
        files={"file": ("data.csv", io.BytesIO(b"x,y\n1,2\n"), "text/csv")},
    )
    assert missing_project.status_code == 404, missing_project.text
    unsupported = client.post(
        "/upload",
        files={"file": ("data.txt", io.BytesIO(b"not a dataset"), "text/plain")},
    )
    assert unsupported.status_code == 415, unsupported.text

    csv = (
        b"age,income,churn\n25,50000,0\n35,70000,1\n45,90000,1\n28,52000,0\n"
        b"31,61000,0\n39,78000,1\n22,45000,0\n51,110000,1\n"
        b"29,57000,0\n42,85000,1\n"
    )
    upload = client.post(
        "/upload",
        headers={"X-Project-Id": project_id},
        files={"file": ("data.csv", io.BytesIO(csv), "text/csv")},
    )
    assert upload.status_code == 200, upload.text
    session = upload.json()
    assert session["row_count"] == 10

    datasets = client.get(f"/api/projects/{project_id}/datasets")
    assert datasets.status_code == 200 and len(datasets.json()) == 1, datasets.text

    trained = client.post(
        "/train",
        json={"session_id": session["session_id"], "target_column": "churn", "model_key": "random_forest"},
    )
    assert trained.status_code == 200, trained.text
    runs = client.get(f"/api/projects/{project_id}/runs")
    assert runs.status_code == 200 and len(runs.json()) == 1, runs.text

    prediction = client.post(
        "/predict",
        json={"session_id": session["session_id"], "features": {"age": 30, "income": 60000}},
    )
    assert prediction.status_code == 200, prediction.text
    exported = client.get(f"/export/model/{session['session_id']}")
    assert exported.status_code == 200, exported.text
    print("Backend integration: PASS")


if __name__ == "__main__":
    run()
