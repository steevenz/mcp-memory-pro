-- 1. Create a temporary mapping of duplicate nodes to their survivors
CREATE TEMP TABLE node_dedup_mapping AS
SELECT
    n.id AS old_id,
    s.id AS survivor_id
FROM nodes n
JOIN (
    SELECT project_id, name, type, id
    FROM (
        SELECT project_id, name, type, id,
               ROW_NUMBER() OVER (PARTITION BY project_id, name, type ORDER BY updated_at DESC, id DESC) as rn
        FROM nodes
        WHERE deleted_at IS NULL
    ) WHERE rn = 1
) s ON n.project_id = s.project_id AND n.name = s.name AND n.type = s.type
WHERE n.id != s.id AND n.deleted_at IS NULL;

-- 2. Update edges to point to survivor IDs
-- Note: We use COALESCE to keep old value if no mapping exists, but the WHERE clause restricts it.
UPDATE edges
SET source_id = (SELECT survivor_id FROM node_dedup_mapping WHERE old_id = source_id)
WHERE source_id IN (SELECT old_id FROM node_dedup_mapping);

UPDATE edges
SET target_id = (SELECT survivor_id FROM node_dedup_mapping WHERE old_id = target_id)
WHERE target_id IN (SELECT old_id FROM node_dedup_mapping);

-- 3. Delete the duplicate nodes
DELETE FROM nodes
WHERE id IN (SELECT old_id FROM node_dedup_mapping);

-- 4. Clean up temp table
DROP TABLE IF EXISTS node_dedup_mapping;

-- 5. Add unique index for node name/type within a project
CREATE UNIQUE INDEX IF NOT EXISTS idx_nodes_unique_context
ON nodes(project_id, name, type)
WHERE deleted_at IS NULL;

-- 6. Add performance indexes
CREATE INDEX IF NOT EXISTS idx_edges_source_target ON edges(source_id, target_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_nodes_updated_at ON nodes(updated_at DESC);
