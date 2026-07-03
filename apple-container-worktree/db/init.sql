-- Runs on first init only (when the postgres data volume is empty).
-- Each worktree has its own data volume, so each worktree gets its own init.
CREATE TABLE IF NOT EXISTS counter (
  id int PRIMARY KEY DEFAULT 1,
  n  int NOT NULL DEFAULT 0
);

INSERT INTO counter (id, n) VALUES (1, 0)
  ON CONFLICT (id) DO NOTHING;
