import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerCommitToParent } from './tools/commit-to-parent.js';

const server = new McpServer({
  name: 'cctree',
  version: '0.1.0',
});

registerCommitToParent(server);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('cctree MCP server running on stdio');
