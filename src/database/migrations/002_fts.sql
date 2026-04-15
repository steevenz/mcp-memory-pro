-- FTS5 standalone virtual table for full-text search on nodes.
-- Standalone (no content= option) so there is no column-name mapping
-- ambiguity with the source table. Triggers keep it in sync manually.
CREATE VIRTUAL TABLE IF NOT EXISTS nodes_fts USING fts5(
  name,
  content,
  tags,
  node_id    UNINDEXED,
  project_id UNINDEXED,
  tokenize   = 'unicode61'
);

-- Backfill existing nodes only if the FTS table is empty (idempotent).
INSERT INTO nodes_fts(name, content, tags, node_id, project_id)
SELECT name, content, tags, id, project_id
FROM nodes
WHERE deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM nodes_fts LIMIT 1);

-- Insert trigger: index new nodes immediately.
CREATE TRIGGER IF NOT EXISTS nodes_fts_insert
AFTER INSERT ON nodes
BEGIN
  INSERT INTO nodes_fts(name, content, tags, node_id, project_id)
  VALUES (new.name, new.content, new.tags, new.id, new.project_id);
END;

-- Update trigger: re-index only when the node is NOT being soft-deleted.
CREATE TRIGGER IF NOT EXISTS nodes_fts_update
AFTER UPDATE ON nodes
WHEN new.deleted_at IS NULL
BEGIN
  DELETE FROM nodes_fts WHERE node_id = old.id;
  INSERT INTO nodes_fts(name, content, tags, node_id, project_id)
  VALUES (new.name, new.content, new.tags, new.id, new.project_id);
END;

-- Soft-delete trigger: remove from FTS index when node is soft-deleted.
CREATE TRIGGER IF NOT EXISTS nodes_fts_soft_delete
AFTER UPDATE ON nodes
WHEN new.deleted_at IS NOT NULL AND old.deleted_at IS NULL
BEGIN
  DELETE FROM nodes_fts WHERE node_id = old.id;
END;

-- Hard-delete trigger: remove from FTS index on physical delete.
CREATE TRIGGER IF NOT EXISTS nodes_fts_delete
AFTER DELETE ON nodes
BEGIN
  DELETE FROM nodes_fts WHERE node_id = old.id;
END;
