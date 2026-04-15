# MCP Memory Pro - API Documentation

**Version:** 2.0.0  
**Status:** Production Ready  
**Database:** SQLite (sql.js WASM-based)  

---

## Overview

MCP Memory Pro is a Model Context Protocol server that provides a SQLite-backed knowledge graph memory system for AI agents. It features "The Big Five" consolidated tool suite for efficient graph operations.

**Key Features:**
- Zero-config project context detection based on filesystem
- Knowledge graph with nodes, edges, and atomic facts
- Full-text search (FTS5) - *Note: Not supported in sql.js, skipped gracefully*
- Debounced persistence for optimal write performance
- Health monitoring and backup/restore capabilities
- Input validation and resource limits for production safety

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MCP_DATA_DIR` | `./data` | Directory for database storage |
| `MCP_DB_NAME` | `memory.sqlite` | Database filename |
| `MCP_LOG_LEVEL` | `info` | Logging verbosity (debug, info, warn, error) |

---

## Tools

### 1. init_project

Initialize a new project or update an existing one.

**Parameters:**
```typescript
{
  id?: string;              // Optional: Custom project ID (auto-generated if not provided)
  name?: string;            // Optional: Project name (auto-detected from directory if not provided)
  description?: string;      // Optional: Project description
  cwd?: string;             // Optional: Working directory for context detection
}
```

**Returns:**
```typescript
{
  success: boolean;
  action: "created" | "updated";
  project: {
    id: string;
    name: string;
    description: string | null;
    created_at: string;
    updated_at: string;
  };
}
```

**Example:**
```json
{
  "name": "My AI Project",
  "description": "Knowledge graph for AI research"
}
```

---

### 2. upsert_graph

Consolidated tool to add or update nodes and edges in the graph. Supports batch processing.

**Parameters:**
```typescript
{
  project_id?: string;      // Optional: Auto-detected from context if not provided
  cwd?: string;             // Optional: Working directory for context detection
  nodes?: NodeInput[];      // Optional: New or existing nodes to upsert (max 100)
  edges?: EdgeInput[];      // Optional: Directed relationships (max 100)
  updates?: NodeUpdate[];   // Optional: Specific updates for existing node IDs (max 50)
}
```

**NodeInput Schema:**
```typescript
{
  name: string;             // Required: Node name (1-500 chars)
  type: string;             // Required: Node type (1-100 chars)
  content?: string;         // Optional: Node content (max 10,000 chars)
  tags?: string[];         // Optional: Tags (max 50, each max 100 chars)
  metadata?: Record<string, unknown>; // Optional: Metadata object
  observations?: string[];  // Optional: Atomic facts (max 100, each max 1,000 chars)
}
```

**EdgeInput Schema:**
```typescript
{
  source_id: string;        // Required: Source node ID
  target_id: string;        // Required: Target node ID
  relation: string;        // Required: Relationship type (1-100 chars)
  weight?: number;         // Optional: Edge weight (0-1000, default 1.0)
  metadata?: Record<string, unknown>; // Optional: Metadata object
}
```

**NodeUpdate Schema:**
```typescript
{
  node_id: string;          // Required: Node ID to update
  name?: string;           // Optional: New name (1-500 chars)
  type?: string;            // Optional: New type (1-100 chars)
  content?: string;         // Optional: New content (max 10,000 chars)
  tags?: string[];         // Optional: New tags (max 50, each max 100 chars)
  metadata?: Record<string, unknown>; // Optional: New metadata
}
```

**Returns:**
```typescript
{
  nodes?: { success: boolean; created: Node[] };
  edges?: { success: boolean; created: Edge[] };
  updates?: Array<{ success: boolean; node: Node }>;
}
```

**Example:**
```json
{
  "nodes": [
    {
      "name": "Neural Networks",
      "type": "concept",
      "content": "Artificial neural networks are computing systems inspired by biological neural networks.",
      "tags": ["AI", "ML", "Deep Learning"]
    }
  ],
  "edges": [
    {
      "source_id": "node-id-1",
      "target_id": "node-id-2",
      "relation": "relates_to"
    }
  ]
}
```

---

### 3. query_graph

Unified query tool for searching, listing, and traversing the graph.

**Parameters:**
```typescript
{
  project_id?: string;      // Optional: Auto-detected from context if not provided
  cwd?: string;             // Optional: Working directory for context detection
  mode: "search" | "traverse" | "path" | "list" | "subgraph";
  params: {
    query?: string;         // Search query string (mode: search, 1-1,000 chars)
    node_id?: string;       // Source node ID (mode: traverse, path)
    target_id?: string;     // Target node ID (mode: path)
    depth?: number;         // Hops/depth (mode: traverse, 1-5, default 1)
    limit?: number;         // Pagination limit (mode: list, search, 1-1,000)
    offset?: number;        // Pagination offset (mode: list)
    ids?: string[];         // Specific IDs (mode: list, subgraph, max 100)
    filters?: Filter[];     // Metadata filters (mode: search, max 10)
    include_observations?: boolean; // Include atomic facts (mode: list)
  };
}
```

**Filter Schema:**
```typescript
{
  key: string;              // Metadata key (alphanumeric, dots, hyphens only)
  op: "=" | "!=" | ">" | "<" | ">=" | "<=" | "LIKE" | "IN";
  value: string | number | boolean | string[] | number[];
}
```

**Returns:**
```typescript
// Mode: search
{
  success: boolean;
  results: Node[];
  total: number;
}

// Mode: traverse
{
  success: boolean;
  node: Node;
  neighbors: Node[];
  depth: number;
}

// Mode: path
{
  success: boolean;
  found: boolean;
  path?: {
    nodes: (Node | undefined)[];
    edges: (Edge | undefined)[];
  };
  message?: string;
}

// Mode: list
{
  success: boolean;
  nodes: Node[];
  total: number;
}

// Mode: subgraph
{
  success: boolean;
  nodes: Node[];
  edges: Edge[];
}
```

**Examples:**

**Search mode:**
```json
{
  "mode": "search",
  "params": {
    "query": "neural networks",
    "limit": 10
  }
}
```

**Traverse mode:**
```json
{
  "mode": "traverse",
  "params": {
    "node_id": "node-id-1",
    "depth": 2
  }
}
```

**Path mode:**
```json
{
  "mode": "path",
  "params": {
    "node_id": "node-id-1",
    "target_id": "node-id-2",
    "max_depth": 5
  }
}
```

---

### 4. manage_data

Administrative and maintenance tools for database and project health.

**Parameters:**
```typescript
{
  project_id?: string;      // Optional: Auto-detected from context if not provided
  cwd?: string;             // Optional: Working directory for context detection
  action: "summarize" | "maintenance" | "purge" | "list_projects" | "export" | "backup" | "restore";
  backup_path?: string;     // Required for backup/restore actions
}
```

**Actions:**

**summarize** - Get project statistics:
```json
{
  "action": "summarize"
}
```
**Returns:**
```typescript
{
  success: boolean;
  stats: {
    nodes: number;
    edges: number;
    observations: number;
    projects: number;
  };
}
```

**maintenance** - Run database optimization (VACUUM, ANALYZE, FTS5 optimize):
```json
{
  "action": "maintenance"
}
```

**purge** - Physically delete soft-deleted items:
```json
{
  "action": "purge"
}
```

**list_projects** - List all projects:
```json
{
  "action": "list_projects"
}
```

**export** - Export full project as JSON:
```json
{
  "action": "export"
}
```

**backup** - Create database backup:
```json
{
  "action": "backup",
  "backup_path": "./data/backups/backup-2024-04-14.sqlite"
}
```

**restore** - Restore from backup:
```json
{
  "action": "restore",
  "backup_path": "./data/backups/backup-2024-04-14.sqlite"
}
```

---

### 5. delete_data

Destructive operations for removing data or entire projects.

**Parameters:**
```typescript
{
  project_id?: string;      // Optional: Auto-detected from context if not provided
  cwd?: string;             // Optional: Working directory for context detection
  type: "nodes" | "edges" | "project" | "clear";
  ids?: string[];          // Required for nodes/edges (max 100)
}
```

**Actions:**

**nodes** - Delete specific nodes (soft delete):
```json
{
  "type": "nodes",
  "ids": ["node-id-1", "node-id-2"]
}
```

**edges** - Delete specific edges (soft delete):
```json
{
  "type": "edges",
  "ids": ["edge-id-1", "edge-id-2"]
}
```

**project** - Delete entire project (cascade deletes all nodes/edges):
```json
{
  "type": "project"
}
```

**clear** - Clear all data from project (soft delete):
```json
{
  "type": "clear"
}
```

---

### 6. health_check

Check the health of the MCP server and database.

**Parameters:** None

**Returns:**
```typescript
{
  success: boolean;
  status: "healthy" | "degraded";
  checks: {
    server: string;
    database: string;
    integrity: string[];
    pending_writes: boolean;
  };
  timestamp: string;
}
```

**Example Response:**
```json
{
  "success": true,
  "status": "healthy",
  "checks": {
    "server": "healthy",
    "database": "healthy",
    "integrity": ["ok"],
    "pending_writes": false
  },
  "timestamp": "2024-04-14T11:47:00.284Z"
}
```

---

## Data Models

### Node
```typescript
{
  id: string;
  project_id: string;
  name: string;
  type: string;
  content: string | null;
  tags: string | null;        // JSON array
  metadata: string | null;     // JSON object
  version: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}
```

### Edge
```typescript
{
  id: string;
  project_id: string;
  source_id: string;
  target_id: string;
  relation: string;
  weight: number;
  metadata: string | null;     // JSON object
  created_at: string;
  deleted_at: string | null;
}
```

### Project
```typescript
{
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}
```

---

## Safety Limits

| Resource | Limit | Description |
|----------|-------|-------------|
| Batch size (nodes) | 100 | Maximum nodes per batch operation |
| Batch size (edges) | 100 | Maximum edges per batch operation |
| Batch size (updates) | 50 | Maximum updates per batch operation |
| Array size (tags) | 50 | Maximum tags per node |
| Array size (observations) | 100 | Maximum observations per node |
| String length (node name) | 500 | Maximum characters |
| String length (node type) | 100 | Maximum characters |
| String length (content) | 10,000 | Maximum characters |
| String length (search query) | 1,000 | Maximum characters |
| BFS traversal depth | 5 | Maximum hops |
| BFS traversal timeout | 30s | Maximum duration |
| BFS node cap | 2,000 | Maximum nodes visited |
| Filters per search | 10 | Maximum metadata filters |
| IDs per request | 100 | Maximum IDs in list/subgraph |

---

## Performance Characteristics

### Persistence
- **Debounced Writes**: Database writes are batched with a 1-second delay
- **Transaction Safety**: Transactions persist immediately on commit
- **Rollback Safety**: Failed transactions do not persist partial state

### Caching
- **Project Cache**: LRU cache with 100 entries for project lookups
- **Cache Invalidation**: Automatic on project updates/deletes

### Database Engine
- **Engine**: sql.js (WASM-based SQLite)
- **Limitations**: 
  - No WAL mode (no concurrent writes)
  - In-memory database with manual persistence
  - FTS5 not supported (skipped gracefully)
  - No native connection pooling

---

## Error Handling

All tools follow a consistent error response format:

```typescript
{
  success: false;
  error: {
    code: string;           // Error code (e.g., "NOT_FOUND", "INVALID_INPUT")
    message: string;        // Human-readable error message
  };
}
```

**Common Error Codes:**
- `NOT_FOUND` - Resource not found
- `INVALID_INPUT` - Invalid input parameters
- `INTERNAL_ERROR` - Internal server error
- `RESOURCE_EXHAUSTED` - Resource limits exceeded (BFS timeout, node cap)

---

## Deployment

### Installation
```bash
npm install
```

### Build
```bash
npm run build
```

### Development
```bash
npm run dev
```

### Production
```bash
npm run build
npm start
```

### Environment Setup
```bash
export MCP_DATA_DIR=/path/to/data
export MCP_LOG_LEVEL=info
```

---

## Production Considerations

### Known Limitations
1. **FTS5 Not Supported**: sql.js doesn't support FTS5; full-text search is disabled
2. **Single-Threaded**: sql.js is single-threaded; no concurrent writes
3. **Memory Usage**: Database loaded entirely in memory
4. **Manual Persistence**: Writes are debounced; ensure graceful shutdown

### Best Practices
1. Use `backup` before major operations
2. Monitor with `health_check` regularly
3. Use transactions for multi-step operations
4. Respect batch size limits
5. Set appropriate `MCP_LOG_LEVEL` for production

### Monitoring
- Use `health_check` tool for database integrity
- Monitor logs for persistence errors
- Check `pending_writes` status before shutdown

---

## License

See LICENSE file for details.
