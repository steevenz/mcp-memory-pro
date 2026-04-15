#!/usr/bin/env node

/**
 * MCP Memory Pro - Entry point for npx execution
 * This script runs the server directly using ts-node/register
 */

const path = require('path');

// Set default environment variables
process.env.MCP_DATA_DIR = process.env.MCP_DATA_DIR || path.join(process.cwd(), 'data');
process.env.MCP_LOG_LEVEL = process.env.MCP_LOG_LEVEL || 'info';

// Register ts-node to handle TypeScript files
require('ts-node/register/transpile-only');

// Run the main server
require(path.join(__dirname, '..', 'src', 'index.ts'));
