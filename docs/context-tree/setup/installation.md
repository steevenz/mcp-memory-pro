---
title: "Installation"
tags: ["npm", "node", "build"]
keywords: ["installation", "scripts", "commands"]
related: ["./context.md"]
importance: 90
recency: 1.0
maturity: draft
accessCount: 0
updateCount: 1
createdAt: "2026-04-13T09:26:00Z"
updatedAt: "2026-04-13T09:26:00Z"
---

# Installation

## Prerequisites
- **Node.js**: Version 18.0.0 or higher.
- **NPM**: Standard package manager.

## Process

### 1. Fetch Dependencies
Install core dependencies including `better-sqlite3`, `zod`, and `pino`.
```bash
npm install
```

### 2. Build the Project
Compile the TypeScript source into a production-ready JavaScript bundle.
```bash
npx tsc
```

### 3. Verify Binary
Ensure `dist/index.js` is generated successfully.
```bash
ls dist/index.js
```
