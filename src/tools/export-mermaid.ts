import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  listTrees,
  loadChildSummary,
  resolveTree,
} from '../lib/storage.js';
import { renderMermaid } from '../lib/mermaid.js';
import {
  renderArchitectureMermaid,
  ArchitectureMermaidError,
} from '../lib/mermaid-architecture.js';

export type ExportMermaidMode = 'structure' | 'architecture';

export interface ExportMermaidArgs {
  tree?: string;
  mode?: ExportMermaidMode;
}

export async function exportMermaidTool(
  args: ExportMermaidArgs,
): Promise<string> {
  const mode: ExportMermaidMode = args.mode ?? 'structure';

  if (mode === 'architecture') {
    if (!args.tree) {
      throw new Error(
        'mode "architecture" requires the "tree" argument (architecture diagrams are scoped to one tree).',
      );
    }
    const tree = await resolveTree(args.tree);
    const summaries = new Map<string, string>();
    for (const child of tree.children) {
      if (child.status !== 'committed') continue;
      try {
        summaries.set(
          child.slug,
          await loadChildSummary(tree.slug, child.slug),
        );
      } catch {
        // skip missing summaries
      }
    }
    const result = await renderArchitectureMermaid(tree, summaries);
    return result.diagram;
  }

  const trees = args.tree ? [await resolveTree(args.tree)] : await listTrees();
  return renderMermaid(trees);
}

export function registerExportMermaid(server: McpServer): void {
  server.registerTool(
    'export_mermaid',
    {
      description: [
        'Render the cctree session trees as a Mermaid diagram (text).',
        'Two modes:',
        '- mode="structure" (default): graph of tree → committed/active/abandoned children. Cheap, deterministic, multi-tree.',
        '- mode="architecture": diagram of architectural decisions, components, and flows derived from the committed session summaries (TL;DR + Decisions + Artifacts) via an Anthropic API call. Requires ANTHROPIC_API_KEY in the environment of the cctree MCP server. Single tree only.',
        'The output is mermaid source suitable for pasting into markdown (GitHub, Obsidian, Notion, VSCode all render it natively).',
      ].join(' '),
      inputSchema: {
        tree: z
          .string()
          .optional()
          .describe(
            'Name or slug of a tree. Required when mode="architecture". Optional in structure mode (omit to include all trees).',
          ),
        mode: z
          .enum(['structure', 'architecture'])
          .optional()
          .describe(
            'Diagram mode. "structure" (default) renders the tree hierarchy. "architecture" calls Anthropic to derive decisions/flows from session summaries.',
          ),
      },
    },
    async ({ tree, mode }) => {
      try {
        const diagram = await exportMermaidTool({ tree, mode });
        return {
          content: [{ type: 'text' as const, text: diagram }],
        };
      } catch (err) {
        const message =
          err instanceof ArchitectureMermaidError
            ? `${err.message}\n\nTip: re-run with mode="structure" for the deterministic tree diagram.`
            : (err as Error).message;
        return {
          content: [{ type: 'text' as const, text: message }],
          isError: true,
        };
      }
    },
  );
}
