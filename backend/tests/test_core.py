import os
import sqlite3
import tempfile
import unittest

import pandas as pd

from app import job_store, pipeline, platform_store


class CoreWorkflowTests(unittest.TestCase):
    def test_profile_contains_quality_signals(self):
        frame = pd.DataFrame({"age": [1, 2, 2], "target": [0, 1, 0]})
        profile = pipeline.analyze_dataset_pipeline(frame)["profile"]
        self.assertEqual(profile["duplicate_rows"], 0)
        self.assertIn("age", profile["numeric_summary"])
        self.assertTrue(any("Small dataset" in warning for warning in profile["warnings"]))

    def test_sequential_numeric_feature_is_not_removed(self):
        frame = pd.DataFrame({"x": range(10), "target": [0, 1] * 5})
        previous = pipeline.EXPORTS_DIR
        pipeline.EXPORTS_DIR = tempfile.mkdtemp(prefix="axio-test-exports-")
        try:
            result = pipeline.train_pipeline("sequential", frame, "target")
            self.assertEqual(result["problem_type"], "classification")
        finally:
            pipeline.EXPORTS_DIR = previous

    def test_invalid_target_is_actionable(self):
        frame = pd.DataFrame({"x": [1, 2, 3], "target": [0, None, 1]})
        with self.assertRaisesRegex(ValueError, "missing values"):
            pipeline.train_pipeline("invalid", frame, "target")

    def test_job_store_persists_and_filters_by_owner(self):
        previous = job_store.DB_PATH
        root = tempfile.mkdtemp(prefix="axio-test-jobs-")
        job_store.DB_PATH = os.path.join(root, "jobs.db")
        try:
            job_store.init_job_db()
            job = job_store.create_job("session", "owner-a", "project", {"target_column": "y"})
            job_store.update_job(job["id"], status="completed", progress=100, result={"ok": True})
            self.assertEqual(job_store.get_job(job["id"], "owner-a")["result"], {"ok": True})
            self.assertIsNone(job_store.get_job(job["id"], "owner-b"))
        finally:
            job_store.DB_PATH = previous

    def test_project_membership_and_audit(self):
        previous = platform_store.DB_PATH
        root = tempfile.mkdtemp(prefix="axio-test-platform-")
        platform_store.DB_PATH = os.path.join(root, "platform.db")
        try:
            with sqlite3.connect(platform_store.DB_PATH) as conn:
                conn.execute("CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT, name TEXT, password_hash TEXT, created_at TEXT)")
                conn.executemany("INSERT INTO users VALUES (?, ?, ?, '', '')", [("u1", "one@example.com", "One"), ("u2", "two@example.com", "Two")])
            platform_store.init_platform_db()
            project = platform_store.create_project("Project", "", "u1")
            platform_store.add_member(project["id"], "u2", "viewer")
            self.assertEqual(platform_store.get_project(project["id"], "u2")["id"], project["id"])
            platform_store.record_audit(project["id"], "u1", "test.event", project["id"])
            self.assertEqual(len(platform_store.list_audit(project["id"])), 1)
        finally:
            platform_store.DB_PATH = previous


if __name__ == "__main__":
    unittest.main()
