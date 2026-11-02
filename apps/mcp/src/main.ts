#!/usr/bin/env node
// stdout is the JSON-RPC channel: anything else written there breaks the protocol. Send every
// console method to stderr before loading the scanner and its dependencies.
for (const method of ['log', 'info', 'debug', 'trace', 'dir'] as const) {
  console[method] = console.error;
}

const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');
const { createServer } = await import('./server.js');
const { optionsFromEnv } = await import('./context.js');

const mcp = createServer(optionsFromEnv());
let closing = false;
const shutdown = async (code = 0) => {
  if (closing) return;
  closing = true;
  await mcp.close();
  process.exit(code);
};
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
process.stdin.on('close', () => void shutdown());

try {
  await mcp.server.connect(new StdioServerTransport());
  process.stderr.write(`[clear-a11y] mcp server ready on stdio\n`);
} catch (err) {
  process.stderr.write(`[clear-a11y] failed to start: ${String(err)}\n`);
  await shutdown(1);
}
