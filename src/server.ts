import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new McpServer({
  name: 'cctree',
  version: '0.1.0',
});

// Tools will be registered in Phase 3

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('cctree MCP server running on stdio');
