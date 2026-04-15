-- Add versioning to nodes
ALTER TABLE nodes ADD COLUMN version INTEGER DEFAULT 1;

-- Observations table for atomic facts
CREATE TABLE IF NOT EXISTS observations (
  id TEXT PRIMARY KEY,
  node_id TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE
);

-- Index for fast lookup of facts for a node
CREATE INDEX IF NOT EXISTS idx_observations_node ON observations(node_id);
