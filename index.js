#!/usr/bin/env node

/**
 * MCP Memory Pro - Production Entry Point
 * This script requires the built dist/index.js file for production use
 */

const path = require('path');
const fs = require('fs');

// Set default environment variables
process.env.MCP_DATA_DIR = process.env.MCP_DATA_DIR || path.join(process.cwd(), 'data');
process.env.MCP_LOG_LEVEL = process.env.MCP_LOG_LEVEL || 'info';

const distEntry = path.join(__dirname, 'dist', 'index.js');
if (fs.existsSync(distEntry)) {
  require(distEntry);
} else {
  console.error('Error: Could not find dist/index.js');
  console.error('Please run: npm run build');
  console.error('If you are developing locally, use: npm run dev');
  process.exit(1);
}
