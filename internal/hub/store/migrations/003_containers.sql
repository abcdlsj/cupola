-- Per-container history. One row per container per minute, kept for 30 days:
-- enough to chart a container's CPU and memory over a day or a week without
-- costing a row per poll. Rollups are not needed at this resolution.
CREATE TABLE IF NOT EXISTS container_samples (
  node_id TEXT NOT NULL,
  container_id TEXT NOT NULL,
  ts INTEGER NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  image TEXT NOT NULL DEFAULT '',
  cpu REAL NOT NULL DEFAULT 0,
  mem INTEGER NOT NULL DEFAULT 0,
  mem_limit INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (node_id, container_id, ts)
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS container_samples_ts ON container_samples(ts);
