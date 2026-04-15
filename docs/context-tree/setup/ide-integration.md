---
title: "IDE Integration"
tags: ["cursor", "trae", "claude", "mcp"]
keywords: ["integration", "config", "settings"]
related: ["./context.md", "../../.iderules"]
importance: 95
recency: 1.0
maturity: draft
accessCount: 0
updateCount: 1
createdAt: "2026-04-13T09:26:00Z"
updatedAt: "2026-04-13T09:26:00Z"
---

# IDE Integration

## Unified Protocol
`mcp-memory-pro` is designed for seamless integration with AI-powered IDEs. We use a standardized ruleset via `.iderules`.

## Supported Clients

### Cursor & Trae
Add a new MCP server in your settings with any of the following commands:

**Stable (JS)**:
```bash
node c:/absolute/path/to/mcp-memory-pro/dist/index.js
```

**Development (TS-Node)**:
```bash
npx ts-node c:/absolute/path/to/mcp-memory-pro/src/index.ts
```

### Claude Desktop
Update your `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "memory-pro": {
      "command": "node",
      "args": ["c:/path/to/mcp-memory-pro/dist/index.js"]
    }
  }
}
```
