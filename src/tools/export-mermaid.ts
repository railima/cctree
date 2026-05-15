import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { listTrees, resolveTree } from '../lib/storage.js';
import { renderMermaid } from '../lib/mermaid.js';

export interface ExportMermaidArgs {
  tree?: string;
}

export async function exportMermaidTool(
  args: ExportMermaidArgs,
): Promise<string> {
  const trees = args.tree ? [await resolveTree(args.tree)] : await listTrees();
  return renderMermaid(trees);
}

export function registerExportMermaid(server: McpServer): void {
  server.registerTool(
    'export_mermaid',
    {
      description: [
        'Render the cctree session trees as a structural Mermaid diagram (text):',
        'a graph of tree → committed/active/abandoned children. Cheap, deterministic,',
        'multi-tree. The output is mermaid source suitable for pasting into markdown',
        '(GitHub, Obsidian, Notion, VSCode all render it natively).',
        'For an architectural view (decisions, components, flows derived from session',
        'summaries), use the "export_architecture" prompt or the',
        '"get_architecture_context" tool — both run inside the chat with no extra API key.',
      ].join(' '),
      inputSchema: {
        tree: z
          .string()
          .optional()
          .describe(
            'Name or slug of a tree. Optional (omit to include all trees).',
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
