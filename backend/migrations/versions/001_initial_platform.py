"""Create platform project, dataset, and run tables."""
from alembic import op

revision = "001_initial_platform"
down_revision = None
branch_labels = None
depends_on = None

def upgrade():
    op.execute("""CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT DEFAULT '',
        owner_id TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )""")
    op.execute("""CREATE TABLE IF NOT EXISTS project_datasets (
        id TEXT PRIMARY KEY, project_id TEXT NOT NULL, owner_id TEXT NOT NULL,
        session_id TEXT NOT NULL UNIQUE, filename TEXT NOT NULL,
        row_count INTEGER NOT NULL, col_count INTEGER NOT NULL,
        analysis TEXT NOT NULL, created_at TEXT NOT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(id)
    )""")
    op.execute("""CREATE TABLE IF NOT EXISTS project_runs (
        id TEXT PRIMARY KEY, project_id TEXT NOT NULL, owner_id TEXT NOT NULL,
        session_id TEXT NOT NULL, model_name TEXT NOT NULL,
        problem_type TEXT NOT NULL, metrics TEXT NOT NULL, created_at TEXT NOT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(id)
    )""")

def downgrade():
    op.execute("DROP TABLE IF EXISTS project_runs")
    op.execute("DROP TABLE IF EXISTS project_datasets")
    op.execute("DROP TABLE IF EXISTS projects")
