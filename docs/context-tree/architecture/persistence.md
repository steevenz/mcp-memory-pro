---
title: "Persistence Layer"
tags: ["sqlite", "fts5", "database"]
keywords: ["storage", "performance", "indexing"]
related: ["./context.md"]
importance: 85
recency: 1.0
maturity: validated
accessCount: 0
updateCount: 1
createdAt: "2026-04-13T09:27:00Z"
updatedAt: "2026-04-13T09:27:00Z"
---

# Persistence Layer

## Engine: SQLite
We use `better-sqlite3` for high-performance, embedded data storage.

## Features

### Full-Text Search (FTS5)
Nodes are indexed using SQLite's FTS5 engine, allowing for lightning-fast keyword searches across node contents and metadata.

### Performance Pragmas
The server is optimized with production-grade pragmas:
- **WAL Mode**: Write-Ahead Logging for concurrent read/writes.
- **MMAP**: Memory-mapped I/O for faster data access.
- **Cache Size**: Optimized page cache for high-hit ratios.

### Soft Deletion
All deletions are soft-deletes by default. Physical cleanup can be triggered via `manage_data` -> `purge`.
