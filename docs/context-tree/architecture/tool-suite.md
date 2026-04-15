---
title: "Tool Suite: The Big Five"
tags: ["tools", "api", "logic"]
keywords: ["upsert", "query", "manage", "init"]
related: ["./context.md"]
importance: 95
recency: 1.0
maturity: validated
accessCount: 0
updateCount: 1
createdAt: "2026-04-13T09:27:00Z"
updatedAt: "2026-04-13T09:27:00Z"
---

# The Big Five Tool Suite

To minimize "cognitive load" on AI agents and maximize context efficiency, `mcp-memory-pro` consolidates all operations into five high-level tools.

## 1. `init_project`
Initializes a project anchor in the filesystem.
- **Action**: Generates a project ID and writes `.cache/memory-pro/project.json`.
- **Automation**: Injects the cache path into `.gitignore`.

## 2. `upsert_graph`
The primary data ingestion entry point.
- **Input**: Arrays of `nodes`, `edges`, and `updates`.
- **Logic**: Handles batch upserts with soft-updates for existing metadata.

## 3. `query_graph`
The unified retrieval engine.
- **Modes**:
    - `search`: Full-text search with metadata filters.
    - `traverse`: Graph traversal (neighbors).
    - `path`: Shortest path between nodes.
    - `list`: Paginated node retrieval (supports `include_observations`).
    - `subgraph`: Context extraction for injections.

## 4. `manage_data`
Administrative and health operations.
- **Actions**: `summarize`, `maintenance`, `purge`, `list_projects`, `export`.

## 5. `delete_data`
Unified destructive interface.
- **Types**: `nodes`, `edges`, `project`, `clear`.
