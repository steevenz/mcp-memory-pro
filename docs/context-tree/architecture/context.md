---
title: "Domain: Architecture"
tags: ["architecture", "design", "internals"]
keywords: ["structure", "engine", "core"]
related: ["./tool-suite.md", "./context-resolution.md", "./persistence.md"]
importance: 100
recency: 1.0
maturity: validated
accessCount: 0
updateCount: 1
createdAt: "2026-04-13T09:27:00Z"
updatedAt: "2026-04-13T09:27:00Z"
---

# Domain: Architecture

## Purpose
This domain describes the internal structural design and core logic of the `mcp-memory-pro` server, emphasizing the "Big Five" tool strategy and the context-aware resolution system.

## Scope
Included in this domain:
- Unified tool registry logic ("The Big Five").
- Automated project context resolution via filesystem walking.
- Data persistence layer (SQLite + FTS5 + Atomic Observations).
- Knowledge evolution tracking (Versioning).
- Performance optimization and telemetry.

## Usage
Developers should reference this domain when extending the server's capabilities, adding new tools, or optimizing the database schema.
