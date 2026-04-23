import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { listTrees, resolveTree } from '../lib/storage.js';
import { renderMermaid } from '../lib/mermaid.js';

export interface ExportMermaidArgs {
  tree?: string;
}

export async function exportMermaidTool(args: ExportMermaidArgs): Promise<string> {
  const trees = args.tree
    ? [await resolveTree(args.tree)]
    : await listTrees();
  return renderMermaid(trees);
}

export function registerExportMermaid(server: McpServer): void {
  server.registerTool(
    'export_mermaid',
    {
      description:
        'Render the cctree session trees as a Mermaid graph diagram (text). Use this when the user asks to visualize, diagram, or summarize the current state of sessions. The output is a mermaid `graph TD` block suitable for pasting into markdown (GitHub, Obsidian, Notion, VSCode all render it natively). Does not require being inside a cctree session.',
      inputSchema: {
        tree: z
          .string()
          .optional()
          .describe(
            'Name or slug of a single tree to render. When omitted, all trees are included.',
          ),
      },
    },
    async ({ tree }) => {
      try {
        const diagram = await exportMermaidTool({ tree });
        return {
          content: [{ type: 'text' as const, text: diagram }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: (err as Error).message }],
          isError: true,
        };
      }
    },
  );
}
