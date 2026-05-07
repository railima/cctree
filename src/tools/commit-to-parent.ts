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
import {
  validateSummary,
  SummaryValidationError,
} from '../lib/summary-validator.js';

export interface CommitResult {
  tree: string;
  child: string;
  contextSizeKb: number;
  totalCommitted: number;
  warnings: string[];
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

  const { warnings } = validateSummary(summary);

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
    warnings,
  };
}

const SUMMARY_SCHEMA_DESCRIPTION = [
  'Structured summary in markdown. Required sections: ## TL;DR (one short paragraph)',
  'and ## Decisions (one bullet per decision; write as many as you need).',
  'Optional sections: ## Artifacts (file paths touched), ## Open Questions,',
  '## Next Steps, ## Details (verbose notes).',
  'Only TL;DR + Decisions + Artifacts are injected into the next sibling session\'s',
  'system prompt — keep them focused on what future siblings actually need to know.',
  'Open Questions / Next Steps / Details stay on disk and are read on demand via',
  'get_sibling_context. Nothing is truncated; put as much detail as you want under ## Details.',
].join(' ');

export function registerCommitToParent(server: McpServer): void {
  server.registerTool(
    'commit_to_parent',
    {
      description: [
        "Commit a structured summary of this session's key learnings back to the parent tree context.",
        'This makes the knowledge available to future sibling sessions.',
        SUMMARY_SCHEMA_DESCRIPTION,
        'Call this when the user asks to "commit", "save to parent", or "sync back".',
      ].join(' '),
      inputSchema: {
        summary: z
          .string()
          .max(100_000)
          .describe(SUMMARY_SCHEMA_DESCRIPTION),
      },
    },
    async ({ summary }) => {
      try {
        const result = await commitToParent(summary);
        const verb = result.totalCommitted > 1 ? 'Updated' : 'Committed';
        const lines = [
          `${verb} summary for "${result.child}" to tree "${result.tree}".`,
          `Injected context: ${result.contextSizeKb} KB (${result.totalCommitted} sessions committed).`,
          'The next sibling session created via "cctree branch" will include TL;DR + Decisions + Artifacts.',
        ];
        if (result.warnings.length > 0) {
          lines.push('');
          lines.push('Warnings:');
          for (const w of result.warnings) lines.push(`  - ${w}`);
        }

        return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
      } catch (err) {
        const message =
          err instanceof SummaryValidationError
            ? (err as SummaryValidationError).message
            : (err as Error).message;
        return {
          content: [{ type: 'text' as const, text: message }],
          isError: true,
        };
      }
    },
  );
}
