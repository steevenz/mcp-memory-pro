import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { DB_PATH } from "./config";
import { SQLiteManager } from "./database/sqlite-manager";
import { registerProjectTools } from "./tools/project-tools";
import { registerGraphTools } from "./tools/graph-tools";
import { registerSearchTools, Filter } from "./tools/search-tools";
import { toolResult } from "./utils/errors";
import { logger } from "./logger";
import { saveProjectContext, loadProjectContext, getProjectIdFromCwd, getProjectNameFromCwd } from "./utils/context-helper";

let projectTools: returnType<typeof registerProjectTools>;
let graphTools: returnType<typeof registerGraphTools>;
let searchTools: returnType<typeof registerSearchTools>;
let db: SQLiteManager;

type returnType<T extends (...args: any) => any> = ReturnType<T>;

// ── Shared Schemas ─────────────────────────────────────────────────────────

const filterInput = z.object({
  key: z.string(),
  op: z.enum(["=", "!=", ">", "<", ">=", "<=", "LIKE", "IN"]),
  value: z.any(),
});

const nodeInput = z.object({
  name: z.string().min(1).max(500),
  type: z.string().min(1).max(100),
  content: z.string().max(10000).optional(),
  tags: z.array(z.string().max(100)).max(50).optional(),
  metadata: z.record(z.unknown()).optional(),
  observations: z.array(z.string().max(1000)).max(100).optional(),
});

const edgeInput = z.object({
  source_id: z.string().min(1),
  target_id: z.string().min(1),
  relation: z.string().min(1).max(100),
  weight: z.number().min(0).max(1000).optional(),
  metadata: z.record(z.unknown()).optional(),
});

/**
 * Resolves the project ID from arguments or local cache.
 */
function resolveProject(args: { project_id?: string; cwd?: string }): { projectId: string; name?: string } {
  if (args.project_id) return { projectId: args.project_id };
  
  const cached = loadProjectContext(args.cwd);
  if (cached) return cached;

  // Last resort: derive from CWD (legacy behavior)
  return { 
    projectId: getProjectIdFromCwd(args.cwd),
    name: getProjectNameFromCwd(args.cwd)
  };
}

const server = new McpServer({ name: "mcp-memory-pro", version: "2.0.0" });

// ── Unified "Big Five" Tool Suite ──────────────────────────────────────────

server.tool("init_project",
  "Initialize or update a project context. Creates a '.cache/memory-pro/project.json' in the project root to automate project detection for future calls. Automatically ignores this cache in .gitignore.",
  { 
    id: z.string().optional().describe("Unique project ID. Auto-generated from CWD if not provided."),
    name: z.string().optional().describe("Project display name. Auto-detected from directory name if not provided."),
    description: z.string().optional().describe("Brief description of the project."),
    cwd: z.string().optional().describe("Target project root directory path.")
  },
  async (a) => withTelemetry("init_project", async () => {
    const res = await projectTools.set_project(a);
    if (res.success && res.project) {
      const targetCwd = a.cwd ?? process.cwd();
      saveProjectContext(targetCwd, res.project.id, res.project.name);
    }
    return toolResult(res);
  })
);

server.tool("upsert_graph",
  "Consolidated tool to add or update nodes and edges in the graph. Supports batch processing of new nodes, soft-updates to existing nodes, and relationship creation.",
  {
    project_id: z.string().optional().describe("Project ID. Auto-detected from context if not provided."),
    cwd: z.string().optional().describe("Working directory for context detection."),
    nodes: z.array(nodeInput).max(100).optional().describe("New or existing nodes to upsert (matched by name+type)."),
    edges: z.array(edgeInput).max(100).optional().describe("Directed relationships to create between nodes."),
    updates: z.array(z.object({
      node_id: z.string().min(1),
      name: z.string().min(1).max(500).optional(),
      type: z.string().min(1).max(100).optional(),
      content: z.string().max(10000).optional(),
      tags: z.array(z.string().max(100)).max(50).optional(),
      metadata: z.record(z.unknown()).optional(),
    })).max(50).optional().describe("Specific updates for existing node IDs.")
  },
  async (a) => withTelemetry("upsert_graph", async () => {
    const { projectId } = resolveProject(a);
    const results: { nodes?: unknown; edges?: unknown; updates?: unknown[] } = {};
    
    if (a.nodes) results.nodes = await graphTools.upsert_nodes({ project_id: projectId, nodes: a.nodes });
    if (a.edges) results.edges = await graphTools.add_edges({ project_id: projectId, edges: a.edges });
    if (a.updates) {
      results.updates = await Promise.all(a.updates.map(u => graphTools.update_node({ project_id: projectId, ...u })));
    }
    
    return toolResult(results);
  })
);

server.tool("query_graph",
  "Unified query tool for searching, listing, and traversing the graph. Use 'mode' to select the query type.",
  {
    project_id: z.string().optional().describe("Project ID. Auto-detected from context if not provided."),
    cwd: z.string().optional().describe("Working directory for context detection."),
    mode: z.enum(["search", "traverse", "path", "list", "subgraph"]).describe("Query mode: 'search' (FTS), 'traverse' (neighbors), 'path' (shortest path), 'list' (raw nodes), 'subgraph' (extraction)."),
    params: z.object({
      query: z.string().min(1).max(1000).optional().describe("Search query string (mode: search)"),
      node_id: z.string().min(1).optional().describe("Source node ID (mode: traverse, path)"),
      target_id: z.string().min(1).optional().describe("Target node ID (mode: path)"),
      depth: z.number().min(1).max(5).optional().describe("Hops/depth (mode: traverse, default=1)"),
      limit: z.number().min(1).max(1000).optional().describe("Pagination limit (mode: list, search)"),
      offset: z.number().min(0).optional().describe("Pagination offset (mode: list)"),
      ids: z.array(z.string().min(1)).max(100).optional().describe("Specific IDs to retrieve (mode: list, subgraph)"),
      filters: z.array(filterInput).max(10).optional().describe("Metadata filters (mode: search)"),
      include_observations: z.boolean().optional().describe("Whether to include atomic facts (mode: list)"),
    })
  },
  async (a) => withTelemetry("query_graph", async () => {
    const { projectId } = resolveProject(a);
    const p = a.params;
    let res;
    
    switch (a.mode) {
      case "search":
        if (!p.query) throw new Error("query is required for search mode");
        res = await searchTools.search_nodes({ project_id: projectId, query: p.query, filters: p.filters as Filter[], limit: p.limit });
        break;
      case "traverse":
        if (!p.node_id) throw new Error("node_id is required for traverse mode");
        res = await graphTools.get_neighbors({ project_id: projectId, node_id: p.node_id, depth: p.depth as any });
        break;
      case "path":
        if (!p.node_id || !p.target_id) throw new Error("node_id and target_id are required for path mode");
        res = await graphTools.find_path({ project_id: projectId, source_id: p.node_id, target_id: p.target_id });
        break;
      case "list":
        res = await graphTools.open_nodes({ project_id: projectId, ids: p.ids, limit: p.limit, offset: p.offset, include_observations: p.include_observations });
        break;
      case "subgraph":
        if (!p.ids || p.ids.length === 0) throw new Error("ids is required for subgraph mode");
        res = await graphTools.get_subgraph({ project_id: projectId, node_ids: p.ids });
        break;
    }
    return toolResult(res);
  })
);

server.tool("manage_data",
  "Administrative and maintenance tools for the database and project health.",
  {
    project_id: z.string().optional(),
    cwd: z.string().optional(),
    action: z.enum(["summarize", "maintenance", "purge", "list_projects", "export", "backup", "restore"]).describe("Action to perform: 'summarize' (stats), 'maintenance' (performance optimize), 'purge' (physical delete soft-deleted items), 'list_projects' (global project list), 'export' (full project dump), 'backup' (create database backup), 'restore' (restore from backup)."),
    backup_path: z.string().optional().describe("Path for backup/restore file (required for backup/restore actions).")
  },
  async (a) => withTelemetry("manage_data", async () => {
    const { projectId } = resolveProject(a);
    let res;
    switch (a.action) {
      case "summarize": res = await graphTools.summarize_project({ project_id: projectId }); break;
      case "maintenance": res = await graphTools.maintenance(); break;
      case "purge": res = await graphTools.purge_deleted_data({ project_id: projectId }); break;
      case "list_projects": res = await projectTools.list_projects(); break;
      case "export": res = await graphTools.export_project({ project_id: projectId }); break;
      case "backup":
        if (!a.backup_path) throw new Error("backup_path is required for backup action");
        db.backup(a.backup_path);
        res = { success: true, backup_path: a.backup_path, message: "Database backup created" };
        break;
      case "restore":
        if (!a.backup_path) throw new Error("backup_path is required for restore action");
        db.restore(a.backup_path);
        // Persist the restored database
        (db as any).flushPersist();
        res = { success: true, backup_path: a.backup_path, message: "Database restored from backup" };
        break;
    }
    return toolResult(res);
  })
);

server.tool("delete_data",
  "Destructive operations for removing data or entire projects.",
  {
    project_id: z.string().optional(),
    cwd: z.string().optional(),
    type: z.enum(["nodes", "edges", "project", "clear"]).describe("Item type to delete."),
    ids: z.array(z.string().min(1)).max(100).optional().describe("Specific IDs to delete (required for nodes/edges).")
  },
  async (a) => withTelemetry("delete_data", async () => {
    const { projectId } = resolveProject(a);
    let res;
    switch (a.type) {
      case "nodes":
        if (!a.ids || a.ids.length === 0) throw new Error("ids is required for deleting nodes");
        res = await graphTools.delete_nodes({ project_id: projectId, ids: a.ids });
        break;
      case "edges":
        if (!a.ids || a.ids.length === 0) throw new Error("ids is required for deleting edges");
        res = await graphTools.delete_edges({ project_id: projectId, ids: a.ids });
        break;
      case "project": res = await projectTools.delete_project({ id: projectId }); break;
      case "clear": res = await graphTools.clear_project({ project_id: projectId }); break;
    }
    return toolResult(res);
  })
);

server.tool("health_check",
  "Check the health of the MCP server and database.",
  {},
  async () => withTelemetry("health_check", async () => {
    const checks = {
      server: "healthy",
      database: "unknown",
      integrity: [],
      pending_writes: false
    };

    try {
      // Check database integrity
      const integrity = db.checkIntegrity();
      checks.integrity = integrity;
      checks.database = integrity.every(r => r === "ok") ? "healthy" : "unhealthy";

      // Check for pending writes
      checks.pending_writes = db.hasPendingWrites();
    } catch (err) {
      checks.database = "error";
      checks.integrity = [`error: ${err instanceof Error ? err.message : String(err)}`];
    }

    return toolResult({
      success: true,
      status: checks.database === "healthy" ? "healthy" : "degraded",
      checks,
      timestamp: new Date().toISOString()
    });
  })
);

// ── Performance Wrapper ──────────────────────────────────────────────────────

/**
 * Wraps a tool execution to log performance metrics.
 */
async function withTelemetry<T>(name: string, fn: () => T | Promise<T>): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    const duration = Date.now() - start;
    if (duration > 500) {
      logger.warn({ tool: name, duration_ms: duration }, "slow tool execution");
    } else {
      logger.debug({ tool: name, duration_ms: duration }, "tool execution complete");
    }
    return result;
  } catch (err) {
    const duration = Date.now() - start;
    logger.error({ tool: name, duration_ms: duration, err }, "tool execution failed");
    throw err;
  }
}

// ── Startup & shutdown ───────────────────────────────────────────────────────

function shutdown() {
  logger.info("shutting down");
  db.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

async function main() {
  // Initialize Database (WASM)
  db = await SQLiteManager.create(DB_PATH);
  
  // Initialize Controllers
  projectTools = registerProjectTools(db);
  graphTools = registerGraphTools(db);
  searchTools = registerSearchTools(db);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("mcp-memory-pro v2 running on stdio (Zero-Drama WIP)");
}

main().catch((err) => {
  logger.error({ err }, "fatal error");
  process.exit(1);
});
