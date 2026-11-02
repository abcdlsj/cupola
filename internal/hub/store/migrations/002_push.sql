-- Per-node collection mode: the hub pulls reachable agents, NATed agents push.
ALTER TABLE nodes ADD COLUMN mode TEXT NOT NULL DEFAULT 'pull';
ALTER TABLE nodes ADD COLUMN token_hash TEXT NOT NULL DEFAULT '';
ALTER TABLE nodes ADD COLUMN last_seq INTEGER NOT NULL DEFAULT 0;
ALTER TABLE nodes ADD COLUMN agent_ts INTEGER NOT NULL DEFAULT 0;

-- A relayed node could only be reached through Bolthole, so it is the one shape
-- that must push. The hub backfills token_hash in Go (it needs the hub key).
UPDATE nodes SET mode = 'push' WHERE transport = 'bolthole';

CREATE UNIQUE INDEX IF NOT EXISTS nodes_token_hash_index ON nodes(token_hash) WHERE token_hash <> '';
