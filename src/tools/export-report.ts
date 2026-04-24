import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { loadChildSummary, resolveTree } from '../lib/storage.js';
import { renderReport } from '../lib/report.js';
import { resolveAuthor } from '../lib/author.js';
import type { ChildSession, TreeConfig } from '../types/index.js';

export interface ExportReportArgs {
  tree: string;
  children?: string[];
  author?: string;
}

function filterChildren(
  tree: TreeConfig,
  slugs: string[] | undefined,
): ChildSession[] {
  if (!slugs || slugs.length === 0) return tree.children;
  const allowed = new Set(slugs);
  const matched = tree.children.filter((c) => allowed.has(c.slug));
  const missing = slugs.filter((s) => !tree.children.some((c) => c.slug === s));
  if (missing.length > 0) {
    throw new Error(
      `Child slug${missing.length > 1 ? 's' : ''} not found in tree "${tree.name}": ${missing.join(', ')}`,
    );
  }
  return matched;
}

export async function exportReportTool(args: ExportReportArgs): Promise<string> {
  const tree = await resolveTree(args.tree);
  const includedChildren = filterChildren(tree, args.children);

  const summaries = new Map<string, string>();
  for (const child of includedChildren) {
    if (child.status !== 'committed') continue;
    try {
      const raw = await loadChildSummary(tree.slug, child.slug);
      summaries.set(child.slug, raw);
    } catch {
      // missing summary file — intentionally omitted from aggregations
    }
  }

  const author = await resolveAuthor({ override: args.author });

  return renderReport({
    tree,
    includedChildren,
    summaries,
    author,
    generatedAt: new Date(),
  });
}

export function registerExportReport(server: McpServer): void {
  server.registerTool(
    'export_report',
    {
      description: [
        'Generate a shareable markdown progress report for a single cctree tree.',
        'The report aggregates, per tree, the decisions made, the open questions still being explored, the artifacts delivered, the hot files (paths mentioned across multiple sessions), a mermaid gantt timeline, and a mermaid structure diagram — with per-session detail collapsed at the bottom.',
        'This is what a developer would share with their tech lead at the end of a sprint so they can see what was worked on, which gaps remain, and where the product is evolving — without reading every session transcript.',
        'The report is dev-authored: the dev runs this command, reviews the markdown, and shares it explicitly. Do not use it to "query" someone else\'s state.',
        'Does not require being inside a cctree session.',
      ].join(' '),
      inputSchema: {
        tree: z
          .string()
          .describe(
            'Name or slug of the tree to report on. Reports are scoped to one tree at a time; run the tool multiple times for multi-tree reports.',
          ),
        children: z
          .array(z.string())
          .optional()
          .describe(
            'Optional list of child session slugs to include. When provided, only these sessions contribute to the aggregations. Omit to include every session in the tree.',
          ),
        author: z
          .string()
          .optional()
          .describe(
            'Optional override for the author name shown in the report. Defaults to `git config user.name` in the current working directory, falling back to the OS username.',
          ),
      },
    },
    async ({ tree, children, author }) => {
      try {
        const markdown = await exportReportTool({ tree, children, author });
        return {
          content: [{ type: 'text' as const, text: markdown }],
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
