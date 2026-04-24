import { createRequire } from 'node:module';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerCommitToParent } from './tools/commit-to-parent.js';
import { registerGetTreeStatus } from './tools/get-tree-status.js';
import { registerGetSiblingContext } from './tools/get-sibling-context.js';
import { registerExportMermaid } from './tools/export-mermaid.js';
import { registerExportObsidian } from './tools/export-obsidian.js';
import { registerExportReport } from './tools/export-report.js';

const require = createRequire(import.meta.url);
const { version } = require('../package.json') as { version: string };

const server = new McpServer({
  name: 'cctree',
  version,
});

registerCommitToParent(server);
registerGetTreeStatus(server);
registerGetSiblingContext(server);
registerExportMermaid(server);
registerExportObsidian(server);
registerExportReport(server);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('cctree MCP server running on stdio');
