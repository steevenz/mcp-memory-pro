# Universal Setup Guide for MCP Memory Pro

This guide covers how to set up MCP Memory Pro with any AI agent or IDE that supports the Model Context Protocol (MCP).

---

## Quick Start (Recommended)

### Option 1: Using npx (After Publishing to npm)

Once the package is published to npm, you can use it with any MCP-compatible client:

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

**Requirements:**
- Node.js >= 18.0.0
- npm or npx installed

---

### Option 2: Local Development (Before Publishing)

For testing before publishing to npm:

#### Step 1: Clone/Download the Repository

```bash
git clone https://github.com/steevenz/mcp-memory-pro.git
cd mcp-memory-pro
npm install
```

#### Step 2: Use the Local Bin Script

**Windows:**
```json
{
  "mcpServers": {
    "memory": {
      "command": "node",
      "args": ["C:\\path\\to\\mcp-memory-pro\\bin\\memory-pro.js"],
      "env": {
        "MCP_DATA_DIR": "C:\\path\\to\\mcp-memory-pro\\data",
        "MCP_LOG_LEVEL": "info"
      }
    }
  }
}
```

**macOS/Linux:**
```json
{
  "mcpServers": {
    "memory": {
      "command": "node",
      "args": ["/path/to/mcp-memory-pro/bin/memory-pro.js"],
      "env": {
        "MCP_DATA_DIR": "/path/to/mcp-memory-pro/data",
        "MCP_LOG_LEVEL": "info"
      }
    }
  }
}
```

---

## IDE-Specific Configuration

### Claude Desktop

**Config file locations:**
- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

**Configuration:**
```json
{
  "mcpServers": {
    "memory": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/memory-pro"],
      "env": {
        "MCP_DATA_DIR": "~/claude-memory-data",
        "MCP_LOG_LEVEL": "info"
      }
    }
  }
}
```

---

### Cursor

**Config file locations:**
- **macOS:** `~/.cursor/mcp.json`
- **Windows:** `%USERPROFILE%\.cursor\mcp.json`
- **Linux:** `~/.cursor/mcp.json`

**Configuration:**
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

**Note:** Restart Cursor after editing the config file.

---

### Windsurf / Cascade

**Config file locations:**
- **Global:** `~/.codeium/windsurf/mcp_config.json` (macOS/Linux) or `%USERPROFILE%\.codeium\windsurf\mcp_config.json` (Windows)
- **Project-level:** `.windsurf/mcp-config.json` in your project root

**Configuration:**
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

---

### Trae

**Config file locations:**
- **macOS:** `~/.trae/mcp.json`
- **Windows:** `%APPDATA%\Trae\mcp.json`

**Configuration:**
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

---

### Generic MCP Client

For any MCP-compatible client, use this universal configuration:

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

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MCP_DATA_DIR` | `./data` | Directory for database storage |
| `MCP_LOG_LEVEL` | `info` | Logging verbosity: `debug`, `info`, `warn`, `error` |

**Examples:**

```bash
# macOS/Linux
export MCP_DATA_DIR="~/my-project-memory"
export MCP_LOG_LEVEL="debug"

# Windows (PowerShell)
$env:MCP_DATA_DIR = "C:\\my-project-memory"
$env:MCP_LOG_LEVEL = "debug"
```

---

## Troubleshooting

### Server Not Appearing in IDE

1. **Restart the IDE** - Most IDEs require a restart to load new MCP configurations
2. **Check the config file path** - Ensure you're editing the correct file for your IDE
3. **Verify Node.js installation**:
   ```bash
   node --version  # Should be >= 18.0.0
   npx --version
   ```

### Permission Errors (macOS/Linux)

If you get permission errors, you may need to make the bin script executable:

```bash
chmod +x /path/to/mcp-memory-pro/bin/memory-pro.js
```

### npx Not Found

If `npx` is not available, you can use npm directly:

```bash
npm install -g @modelcontextprotocol/memory-pro
memory-pro
```

Or use the full path to the package:

```json
{
  "mcpServers": {
    "memory": {
      "command": "node",
      "args": ["/path/to/node_modules/@modelcontextprotocol/memory-pro/bin/memory-pro.js"]
    }
  }
}
```

### Database Locked or Corrupted

1. Stop the MCP server
2. Delete the lock file (if any):
   ```bash
   rm data/memory.sqlite-journal
   ```
3. Restart the server

---

## Verification

After setup, test the server with the `health_check` tool:

```json
{
  "name": "health_check",
  "arguments": {}
}
```

Expected response:
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
  "timestamp": "2024-04-15T10:31:03.096Z"
}
```

---

## Advanced Configuration

### Custom Data Directory

Use an absolute path for the data directory to ensure it's consistent:

```json
{
  "mcpServers": {
    "memory": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/memory-pro"],
      "env": {
        "MCP_DATA_DIR": "/home/user/shared-memory-data",
        "MCP_LOG_LEVEL": "info"
      }
    }
  }
}
```

### Debug Mode

Enable debug logging for troubleshooting:

```json
{
  "mcpServers": {
    "memory": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/memory-pro"],
      "env": {
        "MCP_DATA_DIR": "./data",
        "MCP_LOG_LEVEL": "debug"
      }
    }
  }
}
```

---

## Next Steps

1. Initialize a project using the `init_project` tool
2. Start adding knowledge with `upsert_graph`
3. Query your knowledge graph with `query_graph`
4. Monitor health with `health_check`

See [api.md](../api.md) for detailed tool documentation.
