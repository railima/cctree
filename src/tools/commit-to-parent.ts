import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { readActiveSession } from '../lib/storage.js';
import {
  loadTree,
  updateChildStatus,
  saveChildSummary,
} from '../lib/storage.js';
import { rebuildContext } from '../lib/context-builder.js';
import { contextPath } from '../lib/config.js';
import { stat } from 'node:fs/promises';

export interface CommitResult {
  tree: string;
  child: string;
  contextSizeKb: number;
  totalCommitted: number;
}

export async function commitToParent(summary: string): Promise<CommitResult> {
  const session = await readActiveSession();
  if (!session) {
    throw new Error(
      'Not inside a cctree session. Make sure you launched this session via "cctree branch".',
    );
  }

  const tree = await loadTree(session.tree);
  const child = tree.children.find((c) => c.slug === session.child);
  if (!child) {
    throw new Error(
      `Child session "${session.child}" not found in tree "${tree.name}".`,
    );
  }

  const now = new Date().toISOString();

  await saveChildSummary(session.tree, session.child, summary);
  await updateChildStatus(session.tree, session.child, 'committed', now);
  await rebuildContext(session.tree);

  const ctxPath = contextPath(session.tree);
  const ctxStat = await stat(ctxPath);
  const contextSizeKb = Math.round((ctxStat.size / 1024) * 10) / 10;

  const updatedTree = await loadTree(session.tree);
  const totalCommitted = updatedTree.children.filter(
    (c) => c.status === 'committed',
  ).length;

  return {
    tree: tree.name,
    child: child.name,
    contextSizeKb,
    totalCommitted,
  };
}

export function registerCommitToParent(server: McpServer): void {
  server.registerTool(
    'commit_to_parent',
    {
      description: [
        'Commit a structured summary of this session\'s key learnings back to the parent tree context.',
        'This makes the knowledge available to future sibling sessions.',
        'Structure the summary with markdown sections: ## Decisions, ## Artifacts Created, ## Open Questions, ## Next Steps.',
        'Call this when the user asks to "commit", "save to parent", or "sync back".',
      ].join(' '),
      inputSchema: {
        summary: z.string().max(100_000).describe(
          'Structured summary in markdown. Use sections: ## Decisions, ## Artifacts Created, ## Open Questions, ## Next Steps',
        ),
      },
    },
    async ({ summary }) => {
      try {
        const result = await commitToParent(summary);
        const verb = result.totalCommitted > 1 ? 'Updated' : 'Committed';
        const text = [
          `${verb} summary for "${result.child}" to tree "${result.tree}".`,
          `Accumulated context: ${result.contextSizeKb} KB (${result.totalCommitted} sessions committed).`,
          'The next sibling session created via "cctree branch" will include this context.',
        ].join('\n');

        return { content: [{ type: 'text' as const, text }] };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: (err as Error).message }],
          isError: true,
        };
      }
    },
  );
}
