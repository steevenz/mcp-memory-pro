#!/usr/bin/env node

/**
 * MCP Memory Pro - Entry point for npx execution
 * This script runs the server directly using ts-node/register
 */

const path = require('path');
const fs = require('fs');

// Set default environment variables
process.env.MCP_DATA_DIR = process.env.MCP_DATA_DIR || path.join(process.cwd(), 'data');
process.env.MCP_LOG_LEVEL = process.env.MCP_LOG_LEVEL || 'info';

// Determine the correct path to src
const possiblePaths = [
  path.join(__dirname, 'src', 'index.ts'),
  path.join(__dirname, 'src', 'index.js'),
  path.join(__dirname, 'node_modules', '@steevenz', 'mcp-memory-pro', 'src', 'index.ts'),
  path.join(__dirname, 'node_modules', '@steevenz', 'mcp-memory-pro', 'src', 'index.js'),
];

let srcPath = null;
for (const p of possiblePaths) {
  if (fs.existsSync(p)) {
    srcPath = p;
    break;
  }
}

if (!srcPath) {
  console.error('Error: Could not find src/index.ts or src/index.js');
  console.error('Searched paths:', possiblePaths);
  process.exit(1);
}

// Register ts-node to handle TypeScript files
try {
  require('ts-node/register/transpile-only');
} catch (err) {
  console.error('Error: ts-node is required but not found.');
  console.error('Please install: npm install -g ts-node');
  process.exit(1);
}

// Run the main server
require(srcPath);
