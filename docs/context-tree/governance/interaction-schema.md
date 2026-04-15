---
title: "Interaction Schema"
tags: ["schema", "data", "logging"]
keywords: ["interaction_log", "metadata", "edges"]
related: ["./context.md"]
importance: 85
recency: 1.0
maturity: draft
accessCount: 0
updateCount: 1
createdAt: "2026-04-13T09:27:00Z"
updatedAt: "2026-04-13T09:27:00Z"
---

# Interaction Schema

Standard format for logging AI-user interactions.

## Node: `interaction_log`

### Core Fields
- **Name**: `[Timestamp] - [Task Name]`
- **Type**: `interaction_log`
- **Content**: Detailed narrative of the task.
- **Observations**: Specific atomic facts or discoveries.

### Metadata
```json
{
  "type": "interaction",
  "status": "completed",
  "importance": 7,
  "files_touched": ["src/index.ts", "docs/context.md"]
}
```

## Relationships (Edges)
- `[interaction_log] -> BELONGS_TO -> [project]`
- `[interaction_log] -> MODIFIED -> [file/module]`
- `[interaction_log] -> IMPLEMENTS -> [requirement/task]`
