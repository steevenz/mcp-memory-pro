---
title: "Context Resolution"
tags: ["context", "automation", "cache"]
keywords: ["sticky-context", "resolver", "path-walking"]
related: ["./context.md", "../../src/utils/context-helper.ts"]
importance: 90
recency: 1.0
maturity: validated
accessCount: 0
updateCount: 1
createdAt: "2026-04-13T09:27:00Z"
updatedAt: "2026-04-13T09:27:00Z"
---

# Context Resolution

## The "Sticky Context" Concept
`mcp-memory-pro` eliminates the need for manual `project_id` management by making the server aware of the AI's current working directory.

## Mechanism

### 1. The Anchor
When `init_project` is called, a `.cache/memory-pro/project.json` file is created at the project root.

### 2. Recursive Discovery
When a tool is called without an explicit `project_id`:
1. The resolver starts at the current working directory (`cwd`).
2. It walks up the directory tree looking for the `.cache/memory-pro/project.json` file.
3. If found, it loads the cached `projectId` and `projectName`.

### 3. Fallback
If no cache is found, the server derives a project ID based on the directory name of the current `cwd` (legacy compatibility).
