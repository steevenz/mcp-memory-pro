import { SQLiteManager } from "../database/sqlite-manager";
import { generateId } from "../utils/context-helper";
import { AppError, errorResponse } from "../utils/errors";
import { logger } from "../logger";

export interface Node {
  id: string;
  project_id: string;
  name: string;
  type: string;
  content: string | null;
  tags: string | null;
  metadata: string | null;
  version: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Observation {
  id: string;
  node_id: string;
  content: string;
  created_at: string;
}

export interface Edge {
  id: string;
  project_id: string;
  source_id: string;
  target_id: string;
  relation: string;
  weight: number;
  metadata: string | null;
  deleted_at: string | null;
  created_at: string;
}

const SAFETY_CAP_VISITED_NODES = 2000;
const SAFETY_TIMEOUT_MS = 30000; // 30 second timeout for BFS traversal

function assertProjectExists(db: SQLiteManager, project_id: string): void {
  const p = db.get("SELECT id FROM projects WHERE id = ?", [project_id]);
  if (!p) throw new AppError("NOT_FOUND", `project '${project_id}' not found`);
}

function assertNodeExists(db: SQLiteManager, node_id: string, project_id: string): void {
  const n = db.get(
    "SELECT id FROM nodes WHERE id = ? AND project_id = ? AND deleted_at IS NULL",
    [node_id, project_id]
  );
  if (!n) throw new AppError("NOT_FOUND", `node '${node_id}' not found in project '${project_id}'`);
}

export function registerGraphTools(db: SQLiteManager) {
  return {
    // ------------------------------------------------------------------ nodes

    create_nodes: (args: {
      project_id: string;
      nodes: Array<{
        name: string;
        type: string;
        content?: string;
        tags?: string[];
        metadata?: Record<string, unknown>;
      }>;
    }) => {
      try {
        assertProjectExists(db, args.project_id);
        if (args.nodes.length === 0) throw new AppError("INVALID_INPUT", "nodes must not be empty");

        const created = db.transaction(() => {
          const rows: Node[] = [];
          for (const n of args.nodes) {
            const id = generateId();
            db.run(
              `INSERT INTO nodes (id, project_id, name, type, content, tags, metadata)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [
                id,
                args.project_id,
                n.name,
                n.type,
                n.content ?? null,
                n.tags ? JSON.stringify(n.tags) : null,
                n.metadata ? JSON.stringify(n.metadata) : null,
              ]
            );
            const node = db.get<Node>("SELECT * FROM nodes WHERE id = ?", [id]);
            if (node) rows.push(node);
          }
          return rows;
        });

        logger.info({ project_id: args.project_id, count: created.length }, "nodes created");
        return { success: true, created };
      } catch (err) {
        logger.error({ err }, "create_nodes failed");
        return errorResponse(err);
      }
    },

    upsert_nodes: (args: {
      project_id: string;
      nodes: Array<{
        name: string;
        type: string;
        content?: string;
        tags?: string[];
        metadata?: Record<string, unknown>;
        observations?: string[];
      }>;
    }) => {
      try {
        assertProjectExists(db, args.project_id);
        if (args.nodes.length === 0) throw new AppError("INVALID_INPUT", "nodes must not be empty");

        const result = db.transaction(() => {
          const created: Node[] = [];
          const updated: Node[] = [];

          for (const n of args.nodes) {
            // We use a manual check for "existing" to decide whether to track as created or updated,
            // but we perform the actual write as an atomic UPSERT using the unique index.
            const existing = db.get<Node>(
              "SELECT id, content, tags, metadata FROM nodes WHERE project_id = ? AND name = ? AND type = ? AND deleted_at IS NULL",
              [args.project_id, n.name, n.type]
            );

            const id = existing?.id ?? generateId();
            db.run(
              `INSERT INTO nodes (id, project_id, name, type, content, tags, metadata, version)
               VALUES (?, ?, ?, ?, ?, ?, ?, 1)
               ON CONFLICT(project_id, name, type) WHERE deleted_at IS NULL DO UPDATE SET
                 content = COALESCE(excluded.content, nodes.content),
                 tags = COALESCE(excluded.tags, nodes.tags),
                 metadata = COALESCE(excluded.metadata, nodes.metadata),
                 version = nodes.version + 1,
                 updated_at = CURRENT_TIMESTAMP`,
              [
                id,
                args.project_id,
                n.name,
                n.type,
                n.content !== undefined ? n.content : (existing?.content ?? null),
                n.tags ? JSON.stringify(n.tags) : (existing?.tags ?? null),
                n.metadata ? JSON.stringify(n.metadata) : (existing?.metadata ?? null),
              ]
            );
            const node = db.get<Node>("SELECT * FROM nodes WHERE id = ?", [id]);

            if (node) {
              if (n.observations && n.observations.length > 0) {
                for (const obs of n.observations) {
                  db.run(
                    "INSERT INTO observations (id, node_id, content) VALUES (?, ?, ?)",
                    [generateId(), node.id, obs]
                  );
                }
              }

              if (existing) updated.push(node);
              else created.push(node);
            }
          }
          return { created, updated };
        });

        logger.info(
          { project_id: args.project_id, created: result.created.length, updated: result.updated.length },
          "nodes upserted"
        );
        return { success: true, ...result };
      } catch (err) {
        logger.error({ err }, "upsert_nodes failed");
        return errorResponse(err);
      }
    },

    open_nodes: (args: { 
      project_id: string; 
      ids?: string[]; 
      limit?: number; 
      offset?: number;
      include_observations?: boolean;
    }) => {
      try {
        assertProjectExists(db, args.project_id);

        const limit  = Math.min(args.limit  ?? 200, 1000);
        const offset = args.offset ?? 0;

        let nodes: Node[];
        if (args.ids && args.ids.length > 0) {
          // cap the ids slice to limit/offset so pagination works consistently
          const sliced = args.ids.slice(offset, offset + limit);
          if (sliced.length === 0) return { success: true, nodes: [], total: 0 };
          const placeholders = sliced.map(() => "?").join(", ");
          nodes = db.all<Node>(
            `SELECT * FROM nodes WHERE project_id = ? AND id IN (${placeholders}) AND deleted_at IS NULL`,
            [args.project_id, ...sliced]
          );
        } else {
          nodes = db.all<Node>(
            `SELECT * FROM nodes WHERE project_id = ? AND deleted_at IS NULL
             ORDER BY updated_at DESC LIMIT ? OFFSET ?`,
            [args.project_id, limit, offset]
          );
        }

        if (args.include_observations) {
          return { 
            success: true, 
            nodes: nodes.map(n => ({
              ...n,
              observations: db.all<Observation>("SELECT * FROM observations WHERE node_id = ?", [n.id])
            })), 
            total: nodes.length 
          };
        }

        return { success: true, nodes, total: nodes.length };
      } catch (err) {
        logger.error({ err }, "open_nodes failed");
        return errorResponse(err);
      }
    },

    update_node: (args: {
      project_id: string;
      node_id: string;
      name?: string;
      type?: string;
      content?: string;
      tags?: string[];
      metadata?: Record<string, unknown>;
    }) => {
      try {
        assertProjectExists(db, args.project_id);
        assertNodeExists(db, args.node_id, args.project_id);

        // reject if caller passed nothing to update
        if (
          args.name === undefined &&
          args.type === undefined &&
          args.content === undefined &&
          args.tags === undefined &&
          args.metadata === undefined
        ) {
          throw new AppError("INVALID_INPUT", "at least one field must be provided to update");
        }

        const existing = db.get<Node>("SELECT * FROM nodes WHERE id = ?", [args.node_id]);
        if (!existing) throw new AppError("NOT_FOUND", `node '${args.node_id}' not found`);

        db.run(
          `UPDATE nodes SET
            name = COALESCE(?, name),
            type = COALESCE(?, type),
            content = ?,
            tags = ?,
            metadata = ?,
            version = version + 1,
            updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND project_id = ? AND deleted_at IS NULL`,
          [
            args.name ?? null,
            args.type ?? null,
            args.content !== undefined ? args.content : existing.content,
            args.tags ? JSON.stringify(args.tags) : existing.tags,
            args.metadata ? JSON.stringify(args.metadata) : existing.metadata,
            args.node_id,
            args.project_id
          ]
        );

        const node = db.get<Node>("SELECT * FROM nodes WHERE id = ?", [args.node_id]);
        logger.info({ node_id: args.node_id }, "node updated");
        return { success: true, node };
      } catch (err) {
        logger.error({ err }, "update_node failed");
        return errorResponse(err);
      }
    },

    delete_nodes: (args: { project_id: string; ids: string[] }) => {
      try {
        assertProjectExists(db, args.project_id);
        if (args.ids.length === 0) throw new AppError("INVALID_INPUT", "ids must not be empty");

        const actually_deleted: string[] = [];

        db.transaction(() => {
          for (const id of args.ids) {
            const result = db.run(
              "UPDATE nodes SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND project_id = ? AND deleted_at IS NULL",
              [id, args.project_id]
            );
            if (result.changes > 0) {
              actually_deleted.push(id);
              db.run(
                `UPDATE edges SET deleted_at = CURRENT_TIMESTAMP
                 WHERE project_id = ? AND (source_id = ? OR target_id = ?) AND deleted_at IS NULL`,
                [args.project_id, id, id]
              );
            }
          }
        });

        logger.info({ project_id: args.project_id, count: actually_deleted.length }, "nodes deleted");
        return { success: true, deleted_ids: actually_deleted, deleted_count: actually_deleted.length };
      } catch (err) {
        logger.error({ err }, "delete_nodes failed");
        return errorResponse(err);
      }
    },

    // ------------------------------------------------------------------ edges

    add_edges: (args: {
      project_id: string;
      edges: Array<{
        source_id: string;
        target_id: string;
        relation: string;
        weight?: number;
        metadata?: Record<string, unknown>;
      }>;
    }) => {
      try {
        assertProjectExists(db, args.project_id);
        if (args.edges.length === 0) throw new AppError("INVALID_INPUT", "edges must not be empty");

        const created = db.transaction(() => {
          const rows: Edge[] = [];
          for (const e of args.edges) {
            if (e.source_id === e.target_id) {
              throw new AppError("INVALID_INPUT", `self-loop not allowed: node '${e.source_id}'`);
            }
            assertNodeExists(db, e.source_id, args.project_id);
            assertNodeExists(db, e.target_id, args.project_id);

            const id = generateId();
            db.run(
              `INSERT INTO edges (id, project_id, source_id, target_id, relation, weight, metadata)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [
                id,
                args.project_id,
                e.source_id,
                e.target_id,
                e.relation,
                e.weight ?? 1.0,
                e.metadata ? JSON.stringify(e.metadata) : null,
              ]
            );
            const edge = db.get<Edge>("SELECT * FROM edges WHERE id = ?", [id]);
            if (edge) rows.push(edge);
          }
          return rows;
        });

        logger.info({ project_id: args.project_id, count: created.length }, "edges created");
        return { success: true, created };
      } catch (err) {
        logger.error({ err }, "add_edges failed");
        return errorResponse(err);
      }
    },

    get_edges: (args: {
      project_id: string;
      source_id?: string;
      target_id?: string;
      relation?: string;
    }) => {
      try {
        assertProjectExists(db, args.project_id);

        let sql = "SELECT * FROM edges WHERE project_id = ? AND deleted_at IS NULL";
        const params: unknown[] = [args.project_id];

        if (args.source_id) { sql += " AND source_id = ?"; params.push(args.source_id); }
        if (args.target_id) { sql += " AND target_id = ?"; params.push(args.target_id); }
        if (args.relation)  { sql += " AND relation = ?";  params.push(args.relation); }

        const edges = db.all<Edge>(sql, params);
        return { success: true, edges, total: edges.length };
      } catch (err) {
        logger.error({ err }, "get_edges failed");
        return errorResponse(err);
      }
    },

    delete_edges: (args: { project_id: string; ids: string[] }) => {
      try {
        assertProjectExists(db, args.project_id);
        if (args.ids.length === 0) throw new AppError("INVALID_INPUT", "ids must not be empty");

        const actually_deleted: string[] = [];

        db.transaction(() => {
          for (const id of args.ids) {
            const result = db.run(
              "UPDATE edges SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND project_id = ? AND deleted_at IS NULL",
              [id, args.project_id]
            );
            if (result.changes > 0) actually_deleted.push(id);
          }
        });

        logger.info({ project_id: args.project_id, count: actually_deleted.length }, "edges deleted");
        return { success: true, deleted_ids: actually_deleted, deleted_count: actually_deleted.length };
      } catch (err) {
        logger.error({ err }, "delete_edges failed");
        return errorResponse(err);
      }
    },

    // ------------------------------------------------------------------ traversal

    get_neighbors: (args: {
      project_id: string;
      node_id: string;
      depth?: number;
      direction?: "outbound" | "inbound" | "both";
    }) => {
      try {
        assertProjectExists(db, args.project_id);
        assertNodeExists(db, args.node_id, args.project_id);

        const maxDepth  = Math.min(args.depth ?? 1, 5);
        const direction = args.direction ?? "both";

        // SQLite recursive CTE cycle prevention:
        // UNION deduplicates by full row (node_id, hop). To prevent a node from
        // being re-expanded at a higher hop, we wrap the CTE in a subquery and
        // take MIN(hop) per node_id — this gives each node its shortest distance
        // and the outer WHERE hop = min_hop prevents re-expansion.
        //
        // "both" direction: SQLite only allows one recursive reference per CTE,
        // so we run outbound and inbound as two separate queries and merge in TS.

        const outboundSql = `
          WITH RECURSIVE traversal(node_id, hop) AS (
            SELECT ?, 0
            UNION
            SELECT e.target_id, traversal.hop + 1
            FROM traversal
            JOIN edges e ON e.source_id = traversal.node_id
              AND e.project_id = ?
              AND e.deleted_at IS NULL
            JOIN nodes nb ON nb.id = e.target_id AND nb.deleted_at IS NULL
            WHERE traversal.hop < ?
          )
          SELECT n.*, MIN(t.hop) AS hop
          FROM traversal t
          JOIN nodes n ON n.id = t.node_id
          WHERE n.id != ? AND n.deleted_at IS NULL
          GROUP BY n.id
          ORDER BY hop, n.name
        `;

        const inboundSql = `
          WITH RECURSIVE traversal(node_id, hop) AS (
            SELECT ?, 0
            UNION
            SELECT e.source_id, traversal.hop + 1
            FROM traversal
            JOIN edges e ON e.target_id = traversal.node_id
              AND e.project_id = ?
              AND e.deleted_at IS NULL
            JOIN nodes nb ON nb.id = e.source_id AND nb.deleted_at IS NULL
            WHERE traversal.hop < ?
          )
          SELECT n.*, MIN(t.hop) AS hop
          FROM traversal t
          JOIN nodes n ON n.id = t.node_id
          WHERE n.id != ? AND n.deleted_at IS NULL
          GROUP BY n.id
          ORDER BY hop, n.name
        `;

        const baseParams = [args.node_id, args.project_id, maxDepth, args.node_id];

        let nodes: Array<Node & { hop: number }>;

        if (direction === "outbound") {
          nodes = db.all<Node & { hop: number }>(outboundSql, baseParams);
        } else if (direction === "inbound") {
          nodes = db.all<Node & { hop: number }>(inboundSql, baseParams);
        } else {
          // merge both directions, keep minimum hop per node
          const outbound = db.all<Node & { hop: number }>(outboundSql, baseParams);
          const inbound  = db.all<Node & { hop: number }>(inboundSql, baseParams);
          const byId = new Map<string, Node & { hop: number }>();
          for (const n of [...outbound, ...inbound]) {
            const existing = byId.get(n.id);
            if (!existing || n.hop < existing.hop) byId.set(n.id, n);
          }
          nodes = [...byId.values()].sort((a, b) => a.hop - b.hop || a.name.localeCompare(b.name));
        }

        return { success: true, origin_id: args.node_id, depth: maxDepth, nodes, total: nodes.length };
      } catch (err) {
        logger.error({ err }, "get_neighbors failed");
        return errorResponse(err);
      }
    },

    get_subgraph: (args: {
      project_id: string;
      node_ids: string[];
      include_edges?: boolean;
    }) => {
      try {
        assertProjectExists(db, args.project_id);
        if (args.node_ids.length === 0) {
          throw new AppError("INVALID_INPUT", "node_ids must not be empty");
        }

        const placeholders = args.node_ids.map(() => "?").join(", ");

        const nodes = db.all<Node>(
          `SELECT * FROM nodes WHERE project_id = ? AND id IN (${placeholders}) AND deleted_at IS NULL`,
          [args.project_id, ...args.node_ids]
        );

        let edges: Edge[] = [];
        if (args.include_edges !== false) {
          edges = db.all<Edge>(
            `SELECT * FROM edges
             WHERE project_id = ?
               AND source_id IN (${placeholders})
               AND target_id IN (${placeholders})
               AND deleted_at IS NULL`,
            [args.project_id, ...args.node_ids, ...args.node_ids]
          );
        }

        return { success: true, nodes, edges, total_nodes: nodes.length, total_edges: edges.length };
      } catch (err) {
        logger.error({ err }, "get_subgraph failed");
        return errorResponse(err);
      }
    },

    export_project: (args: { project_id: string }) => {
      try {
        assertProjectExists(db, args.project_id);
        
        const nodes = db.all<Node>(
          "SELECT * FROM nodes WHERE project_id = ? AND deleted_at IS NULL",
          [args.project_id]
        );
        
        const edges = db.all<Edge>(
          "SELECT * FROM edges WHERE project_id = ? AND deleted_at IS NULL",
          [args.project_id]
        );

        const observations = db.all<Observation>(
          `SELECT o.* FROM observations o 
           JOIN nodes n ON o.node_id = n.id 
           WHERE n.project_id = ? AND n.deleted_at IS NULL`,
          [args.project_id]
        );

        return { 
          success: true, 
          project_id: args.project_id,
          nodes, 
          edges, 
          observations,
          total_nodes: nodes.length,
          total_edges: edges.length,
          total_observations: observations.length
        };
      } catch (err) {
        logger.error({ err }, "export_project failed");
        return errorResponse(err);
      }
    },

    summarize_project: (args: { project_id: string }) => {
      try {
        assertProjectExists(db, args.project_id);

        const node_count = (db.get<{ c: number }>(
          "SELECT COUNT(*) as c FROM nodes WHERE project_id = ? AND deleted_at IS NULL",
          [args.project_id]
        ))?.c ?? 0;

        const edge_count = (db.get<{ c: number }>(
          "SELECT COUNT(*) as c FROM edges WHERE project_id = ? AND deleted_at IS NULL",
          [args.project_id]
        ))?.c ?? 0;

        const nodes_by_type = db.all<{ type: string; count: number }>(
          `SELECT type, COUNT(*) as count FROM nodes
           WHERE project_id = ? AND deleted_at IS NULL
           GROUP BY type ORDER BY count DESC`,
          [args.project_id]
        );

        const edges_by_relation = db.all<{ relation: string; count: number }>(
          `SELECT relation, COUNT(*) as count FROM edges
           WHERE project_id = ? AND deleted_at IS NULL
           GROUP BY relation ORDER BY count DESC`,
          [args.project_id]
        );

        const most_connected = db.all<{ id: string; name: string; type: string; degree: number }>(
          `SELECT n.id, n.name, n.type, COUNT(e.id) as degree
           FROM nodes n
           LEFT JOIN edges e ON (e.source_id = n.id OR e.target_id = n.id)
             AND e.project_id = ?
             AND e.deleted_at IS NULL
           WHERE n.project_id = ? AND n.deleted_at IS NULL
           GROUP BY n.id ORDER BY degree DESC LIMIT 10`,
          [args.project_id, args.project_id]
        );

        return {
          success: true,
          project_id: args.project_id,
          node_count,
          edge_count,
          nodes_by_type,
          edges_by_relation,
          most_connected,
        };
      } catch (err) {
        logger.error({ err }, "summarize_project failed");
        return errorResponse(err);
      }
    },
    clear_project: (args: { project_id: string }) => {
      try {
        assertProjectExists(db, args.project_id);

        db.transaction(() => {
          // Hard delete all nodes and edges for this project.
          // Note: cascading delete handled by FKs, but we'll be explicit for edges too.
          db.run("DELETE FROM edges WHERE project_id = ?", [args.project_id]);
          db.run("DELETE FROM nodes WHERE project_id = ?", [args.project_id]);
        });

        logger.info({ project_id: args.project_id }, "project cleared");
        return { success: true, project_id: args.project_id };
      } catch (err) {
        logger.error({ err }, "clear_project failed");
        return errorResponse(err);
      }
    },
    maintenance: () => {
      try {
        const start = Date.now();
        db.executeMaintenance();
        const integrity = db.checkIntegrity();
        const duration = Date.now() - start;

        logger.info({ duration, integrity }, "maintenance tool completed");
        return { success: true, duration_ms: duration, integrity };
      } catch (err) {
        logger.error({ err }, "maintenance failed");
        return errorResponse(err);
      }
    },
    purge_deleted_data: (args: { project_id?: string }) => {
      try {
        const start = Date.now();
        const result = db.transaction(() => {
          let nodesDeleted = 0;
          let edgesDeleted = 0;

          if (args.project_id) {
            nodesDeleted = db.run("DELETE FROM nodes WHERE project_id = ? AND deleted_at IS NOT NULL", [args.project_id]).changes;
            edgesDeleted = db.run("DELETE FROM edges WHERE project_id = ? AND deleted_at IS NOT NULL", [args.project_id]).changes;
          } else {
            nodesDeleted = db.run("DELETE FROM nodes WHERE deleted_at IS NOT NULL").changes;
            edgesDeleted = db.run("DELETE FROM edges WHERE deleted_at IS NOT NULL").changes;
          }

          return { nodesDeleted, edgesDeleted };
        });

        const duration = Date.now() - start;
        logger.info({ ...result, duration }, "purge_deleted_data completed");
        return { success: true, ...result, duration_ms: duration };
      } catch (err) {
        logger.error({ err }, "purge_deleted_data failed");
        return errorResponse(err);
      }
    },
    find_path: (args: {
      project_id: string;
      source_id: string;
      target_id: string;
      max_depth?: number;
    }) => {
      try {
        assertProjectExists(db, args.project_id);
        assertNodeExists(db, args.source_id, args.project_id);
        assertNodeExists(db, args.target_id, args.project_id);

        if (args.source_id === args.target_id) {
          const node = db.get<Node>("SELECT * FROM nodes WHERE id = ?", [args.source_id]);
          return { success: true, path: { nodes: [node], edges: [] } };
        }

        const maxDepth = Math.min(args.max_depth ?? 5, 10);

        // BFS in JS for the shortest path
        const queue: Array<{ node_id: string; path_node_ids: string[]; path_edge_ids: string[] }> = [
          { node_id: args.source_id, path_node_ids: [args.source_id], path_edge_ids: [] }
        ];
        const visited = new Set<string>([args.source_id]);

        let foundNodes: string[] | null = null;
        let foundEdges: string[] | null = null;
        let nodesExplored = 0;
        const startTime = Date.now();

        while (queue.length > 0) {
          nodesExplored++;
          
          // Check node cap
          if (nodesExplored > SAFETY_CAP_VISITED_NODES) {
            throw new AppError("RESOURCE_EXHAUSTED", `BFS safety cap reached (${SAFETY_CAP_VISITED_NODES} nodes). Graph might be too dense.`);
          }
          
          // Check timeout
          if (Date.now() - startTime > SAFETY_TIMEOUT_MS) {
            throw new AppError("RESOURCE_EXHAUSTED", `BFS timeout reached (${SAFETY_TIMEOUT_MS}ms). Graph might be too large or complex.`);
          }

          const current = queue.shift();
          if (!current) break;
          const { node_id, path_node_ids, path_edge_ids } = current;

          if (path_node_ids.length > maxDepth) continue;

          const neighbors = db.all<{ target_id: string; edge_id: string }>(
            `SELECT target_id, id as edge_id FROM edges
             WHERE source_id = ? AND project_id = ? AND deleted_at IS NULL`,
            [node_id, args.project_id]
          );

          for (const neighbor of neighbors) {
            if (neighbor.target_id === args.target_id) {
              foundNodes = [...path_node_ids, neighbor.target_id];
              foundEdges = [...path_edge_ids, neighbor.edge_id];
              break;
            }

            if (!visited.has(neighbor.target_id)) {
              visited.add(neighbor.target_id);
              queue.push({
                node_id: neighbor.target_id,
                path_node_ids: [...path_node_ids, neighbor.target_id],
                path_edge_ids: [...path_edge_ids, neighbor.edge_id]
              });
            }
          }
          if (foundNodes) break;
        }

        if (!foundNodes) {
          return { success: true, found: false, message: "no path found within max depth" };
        }

        // Fetch the full objects
        const nodesPlaceholders = foundNodes.map(() => "?").join(", ");
        const nodes = db.all<Node>(
          `SELECT * FROM nodes WHERE id IN (${nodesPlaceholders})`,
          foundNodes
        );

        // order nodes according to the path
        const nodesMap = new Map(nodes.map(n => [n.id, n]));
        const orderedNodes = foundNodes.map(id => nodesMap.get(id));

        const orderedEdges: (Edge | undefined)[] = [];
        if (foundEdges) {
          const edgesPlaceholders = foundEdges.map(() => "?").join(", ");
          const edges = db.all<Edge>(
            `SELECT * FROM edges WHERE id IN (${edgesPlaceholders})`,
            foundEdges
          );
          const edgesMap = new Map(edges.map(e => [e.id, e]));
          foundEdges.forEach(id => orderedEdges.push(edgesMap.get(id)));
        }

        return {
          success: true,
          found: true,
          path: {
            nodes: orderedNodes,
            edges: orderedEdges
          }
        };
      } catch (err) {
        logger.error({ err }, "find_path failed");
        return errorResponse(err);
      }
    },
  };
}
