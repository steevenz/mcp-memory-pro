# 🧠 MCP Memory Pro: The Big Five

**Production-Ready Knowledge Graph Infrastructure with Zero-Config Context Awareness.**

`@modelcontextprotocol/memory-pro` is a high-performance MCP server designed to transform your IDE into an enterprise-grade second brain. By consolidating complex graph operations into **"The Big Five"** tool suite and introducing automatic project context caching, it offers a seamless, sticky memory experience for AI agents.

---

## 🚀 Vision: Zero-Config Context

Unlike standard memory servers that require manual project ID management, `@modelcontextprotocol/memory-pro` understands the filesystem.

1.  **Init Once**: When you initialize a project, it writes a `.cache/memory-pro/project.json` file in your target project root.
2.  **Sticky Memory**: Every subsequent tool call automatically resolves the project context by walking up the directory tree to find that cache file.
3.  **Unified Tools**: It collapses ~20 legacy tools into 5 powerful primitives, saving your LLM's "cognitive budget" (context window) while increasing precision.

---

## 🛠️ The Big Five Tool Suite

### 1. `init_project` (The Anchor)
**Purpose**: Sets up the bridge between your filesystem and the memory graph.
- **Action**: Creates/Updates project ID and writes the local cache file.
- **Automation**: Automatically appends the cache folder to your `.gitignore`.

### 2. `upsert_graph` (The Writer)
**Purpose**: Efficiently record nodes and edges with historical tracking.
- **Capabilities**: 
    - Batch insert/update nodes and relationships.
    - **Atomic Observations**: Append factual snippets without overwriting main content.
    - **Version Tracking**: Automatic incrementing of entity versions on every update.

### 3. `query_graph` (The Seeker)
**Purpose**: Extract knowledge using multiple traversal and search modes.
- **Modes**: 
    - `search`: Full-text search (FTS5) with metadata filtering.
    - `traverse`: Neighborhood traversal (N-hops).
    - `path`: Shortest pathfinding between two entities.
    - `list`: Paginated retrieval of raw nodes (supports `include_observations`).
    - `subgraph`: Context extraction for LLM injection.

### 4. `manage_data` (The Maintainer)
**Purpose**: Keep your brain healthy and portable.
- **Actions**: 
    - `summarize`: Request graph statistics.
    - `maintenance`: Optimize DB performance (VACUUM/Optimize).
    - `purge`: Reclaim physical space from deleted items.
    - `backup`: Create database backups.
    - `restore`: Restore from backups.
    - `export`: Dump the entire project graph as a JSON blob.

### 5. `delete_data` (The Cleaner)
**Purpose**: Clean up nodes, edges, or entire project graphs.

### 6. `health_check` (The Monitor)
**Purpose**: Check server and database health with integrity checks.

---

## ⚙️ Configuration & Setup

### Quick Start with npx (Recommended)

Add the following to your MCP configuration (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "memory": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/memory-pro"],
      "env": {
        "MCP_DATA_DIR": "./data",
        "MCP_LOG_LEVEL": "info"
      }
    }
  }
}
```

### Local Development (Before Publishing)

For testing before publishing to npm:

```bash
git clone https://github.com/steevenz/mcp-memory-pro.git
cd mcp-memory-pro
npm install
```

Then use the local bin script:

```json
{
  "mcpServers": {
    "memory": {
      "command": "node",
      "args": ["path/to/mcp-memory-pro/bin/memory-pro.js"],
      "env": {
        "MCP_DATA_DIR": "./data",
        "MCP_LOG_LEVEL": "info"
      }
    }
  }
}
```

### Environment Variables (Optional)

- `MCP_DATA_DIR`: Override the default data storage (Default: `./data` inside server root)
- `MCP_LOG_LEVEL`: Logging verbosity (`debug`, `info`, `warn`, `error`)

---

## 📂 Architecture

- **SQLite Backend**: Uses `sql.js` (WASM-based) for cross-platform compatibility with in-memory operations and debounced persistence.
- **Safety Protocol**: BFS traversals are capped at 2,000 nodes and 30 seconds to prevent resource exhaustion.
- **Performance**: Debounced write persistence (1-second batching) for optimal I/O.
- **Telemetry**: All tool calls log performance metrics (Execution time > 500ms triggers a warning).
- **Health Monitoring**: Built-in health check tool for database integrity verification.

### Known Limitations

- FTS5 (full-text search) is not supported by sql.js and is skipped gracefully
- No concurrent writes (sql.js limitation)
- Database operations are in-memory with manual persistence
- No native connection pooling

---

## 📚 Documentation

- **Setup Guide**: See [docs/guidelines/how-to-setup.md](docs/guidelines/how-to-setup.md) for universal setup instructions (Claude, Cursor, Windsurf, Trae, etc.)
- **API Reference**: See [docs/api.md](docs/api.md) for detailed tool documentation

---

## 🤝 Contribution

Built for scalability, clarity, and production readiness.

> [!TIP]
> **Pro Tip**: To switch contexts, simply move your terminal to a different project and run `init_project`. The memory follows your directory focus.
