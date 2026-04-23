import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { listTrees, resolveTree } from '../lib/storage.js';
import { exportToObsidian } from '../lib/obsidian.js';

export interface ExportObsidianArgs {
  vaultPath: string;
  tree?: string;
}

export interface ExportObsidianResult {
  vaultPath: string;
  cctreeDir: string;
  treesWritten: number;
  childrenWritten: number;
  focusedTree: string | null;
}

export async function exportObsidianTool(
  args: ExportObsidianArgs,
): Promise<ExportObsidianResult> {
  const allTrees = await listTrees();
  const focus = args.tree ? await resolveTree(args.tree) : undefined;

  const result = await exportToObsidian(args.vaultPath, allTrees, { tree: focus });

  return {
    vaultPath: result.vaultPath,
    cctreeDir: result.cctreeDir,
    treesWritten: result.treesWritten,
    childrenWritten: result.childrenWritten,
    focusedTree: focus ? focus.name : null,
  };
}

export function registerExportObsidian(server: McpServer): void {
  server.registerTool(
    'export_obsidian',
    {
      description:
        'Export cctree session trees as wiki-linked markdown into an existing Obsidian vault for graph-view visualization. Creates a `cctree/` subfolder with a MOC (index.md), one subfolder per tree, and one file per committed child containing the full summary plus wiki-links to siblings and to any file paths mentioned in the summary. Only committed children get their own file. Idempotent: re-running overwrites `<vault>/cctree/` entirely but never touches files outside it. Use this when the user asks to visualize trees in Obsidian, sync sessions to a vault, or see "hot files" across releases.',
      inputSchema: {
        vaultPath: z
          .string()
          .describe(
            'Absolute path to an existing Obsidian vault directory. The command errors out if the path does not exist — it never creates a vault.',
          ),
        tree: z
          .string()
          .optional()
          .describe(
            'Name or slug of a single tree to export. When provided, only that tree\'s subfolder is regenerated and the top-level index.md is left alone so other trees in the vault stay intact. When omitted, the entire `<vault>/cctree/` subtree is regenerated.',
          ),
      },
    },
    async ({ vaultPath, tree }) => {
      try {
        const result = await exportObsidianTool({ vaultPath, tree });
        const lines: string[] = [];
        if (result.focusedTree) {
          lines.push(
            `Wrote Obsidian vault entries for tree "${result.focusedTree}" to ${result.cctreeDir}/`,
          );
        } else {
          lines.push(`Wrote Obsidian vault entries to ${result.cctreeDir}`);
        }
        lines.push(`  Trees:    ${result.treesWritten}`);
        lines.push(`  Children: ${result.childrenWritten}`);
        return {
          content: [{ type: 'text' as const, text: lines.join('\n') }],
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
