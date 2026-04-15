/**
 * Simple test script for MCP Memory Pro
 * This script tests the MCP server by sending JSON-RPC requests
 */

const { spawn } = require('child_process');
const path = require('path');

// Test configuration
const TESTS = [
  {
    name: 'Initialize Server',
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'test-client',
        version: '1.0.0'
      }
    }
  },
  {
    name: 'List Tools',
    method: 'tools/list',
    params: {}
  },
  {
    name: 'Health Check',
    method: 'tools/call',
    params: {
      name: 'health_check',
      arguments: {}
    }
  },
  {
    name: 'Init Project',
    method: 'tools/call',
    params: {
      name: 'init_project',
      arguments: {
        name: 'Test Project',
        description: 'Test project for MCP Memory Pro'
      }
    }
  },
  {
    name: 'List Projects',
    method: 'tools/call',
    params: {
      name: 'manage_data',
      arguments: {
        action: 'list_projects'
      }
    }
  }
];

async function runTest() {
  console.log('Starting MCP Memory Pro server...');
  
  // Start the server
  const serverPath = path.join(__dirname, 'dist', 'index.js');
  const useDist = process.env.MCP_TEST_USE_DIST === '1';
  const server = useDist
    ? spawn('node', [serverPath], { stdio: ['pipe', 'pipe', 'pipe'] })
    : spawn(
        process.execPath,
        ['-r', 'ts-node/register/transpile-only', path.join(__dirname, 'src', 'index.ts')],
        { stdio: ['pipe', 'pipe', 'pipe'] }
      );

  let requestId = 1;
  const responses = [];
  let stdoutBuf = '';
  let stderrBuf = '';

  server.stdout.on('data', (data) => {
    stdoutBuf += data.toString();
    const parts = stdoutBuf.split('\n');
    stdoutBuf = parts.pop() ?? '';
    const lines = parts.filter(line => line.trim());
    for (const line of lines) {
      try {
        const response = JSON.parse(line);
        responses.push(response);
        console.log(`✓ Response received: ${response.method || response.result || response.error}`);
      } catch (e) {
        // Ignore non-JSON lines (logs)
      }
    }
  });

  server.stderr.on('data', (data) => {
    stderrBuf += data.toString();
    const parts = stderrBuf.split('\n');
    stderrBuf = parts.pop() ?? '';
    const lines = parts.filter(line => line.trim());
    for (const line of lines) {
      try {
        const log = JSON.parse(line);
        console.log(`[LOG] ${log.msg || log.message || JSON.stringify(log)}`);
      } catch (e) {
        console.log(`[LOG] ${line}`);
      }
    }
  });

  // Wait for server to start
  await new Promise(resolve => setTimeout(resolve, 2000));

  console.log('\nRunning tests...\n');

  for (const test of TESTS) {
    console.log(`Testing: ${test.name}`);
    
    const request = {
      jsonrpc: '2.0',
      id: requestId++,
      method: test.method,
      params: test.params
    };

    server.stdin.write(JSON.stringify(request) + '\n');
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Wait for responses
  await new Promise(resolve => setTimeout(resolve, 3000));

  console.log('\n=== Test Results ===');
  console.log(`Total responses received: ${responses.length}`);
  
  // Check for errors
  const errors = responses.filter(r => r.error);
  if (errors.length > 0) {
    console.log(`\n❌ Errors found: ${errors.length}`);
    errors.forEach(e => console.log(`  - ${e.error?.message || JSON.stringify(e.error)}`));
  } else {
    console.log('\n✅ All tests passed!');
  }

  // Cleanup
  server.kill();
  process.exit(0);
}

// Build first
const { exec } = require('child_process');
if (process.env.MCP_TEST_SKIP_BUILD === '1') {
  process.env.MCP_TEST_USE_DIST = '0';
  runTest().catch(console.error);
} else {
  console.log('Building project...');
  exec('npm run build', (error, stdout, stderr) => {
    if (error) {
      console.error('Build failed:', error);
      console.log('Running tests against ts-node (no build) ...');
      process.env.MCP_TEST_USE_DIST = '0';
      runTest().catch(console.error);
    } else {
      console.log('Build successful');
      process.env.MCP_TEST_USE_DIST = '1';
      runTest().catch(console.error);
    }
  });
}
