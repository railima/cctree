import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { readActiveSession, loadTree } from '../lib/storage.js';
import { formatTreePlain } from '../utils/format.js';
import { stat } from 'node:fs/promises';
import { contextPath } from '../lib/config.js';

export interface TreeStatus {
  name: string;
  slug: string;
  activeChild: string | null;
  children: Array<{
    name: string;
    slug: string;
    status: string;
    date: string;
  }>;
  contextSizeKb: number;
  display: string;
}

export async function getTreeStatus(): Promise<TreeStatus> {
  const session = await readActiveSession();
  if (!session) {
    throw new Error(
      'Not inside a cctree session. Make sure you launched this session via "cctree branch".',
    );
  }

  const tree = await loadTree(session.tree);

  let contextSizeKb = 0;
  try {
    const s = await stat(contextPath(session.tree));
    contextSizeKb = Math.round((s.size / 1024) * 10) / 10;
  } catch {
    // no context file yet
  }

  const children = tree.children.map((c) => ({
    name: c.name,
    slug: c.slug,
    status: c.status,
    date: c.committed_at ?? c.created_at,
  }));

  return {
    name: tree.name,
    slug: tree.slug,
    activeChild: session.child,
    children,
    contextSizeKb,
    display: formatTreePlain(tree),
  };
}

export function registerGetTreeStatus(server: McpServer): void {
  server.registerTool(
    'get_tree_status',
    {
      description:
        'Show the current session tree structure with all children and their statuses. Use this to understand what sessions exist, which are committed, and the overall tree context size.',
    },
    async () => {
      try {
        const status = await getTreeStatus();

        const lines = [
          status.display,
          '',
          `Current session: ${status.activeChild ?? 'none'}`,
          `Accumulated context: ${status.contextSizeKb} KB`,
        ];

        return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: (err as Error).message }],
          isError: true,
        };
      }
    },
  );
}
