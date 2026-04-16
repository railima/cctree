import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  readActiveSession,
  loadTree,
  loadChildSummary,
  findChildByNameOrSlug,
} from '../lib/storage.js';

export interface SiblingContext {
  name: string;
  slug: string;
  status: string;
  committedAt: string | null;
  summary: string;
}

export async function getSiblingContext(name: string): Promise<SiblingContext> {
  const session = await readActiveSession();
  if (!session) {
    throw new Error(
      'Not inside a cctree session. Make sure you launched this session via "cctree branch".',
    );
  }

  const tree = await loadTree(session.tree);
  const sibling = await findChildByNameOrSlug(tree, name);

  if (!sibling) {
    const available = tree.children
      .map((c) => `  - ${c.name} (${c.slug}) [${c.status}]`)
      .join('\n');
    throw new Error(
      `Session "${name}" not found in tree "${tree.name}".\nAvailable sessions:\n${available}`,
    );
  }

  if (sibling.status !== 'committed') {
    throw new Error(
      `Session "${sibling.name}" has not been committed yet (status: ${sibling.status}). Only committed sessions have summaries.`,
    );
  }

  const summary = await loadChildSummary(session.tree, sibling.slug);

  return {
    name: sibling.name,
    slug: sibling.slug,
    status: sibling.status,
    committedAt: sibling.committed_at ?? null,
    summary,
  };
}

export function registerGetSiblingContext(server: McpServer): void {
  server.registerTool(
    'get_sibling_context',
    {
      description:
        'Read the committed summary of a sibling session. Use this to understand decisions, artifacts, or context from another session in the same tree without needing the full conversation history.',
      inputSchema: {
        name: z
          .string()
          .describe('Name or slug of the sibling session to read'),
      },
    },
    async ({ name }) => {
      try {
        const ctx = await getSiblingContext(name);
        const header = `## ${ctx.name} (committed ${ctx.committedAt ? new Date(ctx.committedAt).toLocaleDateString() : 'unknown'})\n\n`;
        return {
          content: [{ type: 'text' as const, text: header + ctx.summary }],
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
