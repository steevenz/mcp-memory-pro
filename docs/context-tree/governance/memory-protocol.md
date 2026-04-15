---
title: "Memory Protocol"
tags: ["workflow", "cognitive", "governance"]
keywords: ["loop", "perception", "reflection", "action"]
related: ["./context.md"]
importance: 95
recency: 1.0
maturity: validated
accessCount: 0
updateCount: 2
createdAt: "2026-04-13T09:27:00Z"
updatedAt: "2026-04-13T09:36:00Z"
---

# The Perception-Action-Reflection Protocol

To ensure persistent context, AI agents follow a strict cognitive loop.

## 1. Perception (Re-Onboarding)
Before any action, the AI must synchronize with the graph.
- **Search**: Query for recent `interaction_log` nodes and **Atomic Observations**.
- **Internalize**: Reconstruct the "Story of the Project" from the hybrid retrieval of logs and facts.

## 2. Action (Execution)
Standard development work is performed.

## 3. Reflection (Logging)
After every task, the AI logs its work to the graph.
- **Content**: Summary of the prompt, the result, and the technical changes.
- **Observations**: Append-only atomic facts extracted from the execution.
- **Persistence**: Ensures the next AI agent has perfect context and an audit trail of knowledge evolution (Versioning).
