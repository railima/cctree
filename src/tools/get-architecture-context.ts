import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  ArchitectureContextError,
  buildArchitectureContext,
  renderArchitectureJson,
  renderArchitectureMarkdown,
} from '../lib/architecture-context.js';

export type ArchitectureContextFormat = 'markdown' | 'json';

export interface GetArchitectureContextArgs {
  tree?: string;
  format?: ArchitectureContextFormat;
}

export async function getArchitectureContextTool(
  args: GetArchitectureContextArgs,
): Promise<string> {
  const ctx = await buildArchitectureContext(args.tree);
  const format: ArchitectureContextFormat = args.format ?? 'markdown';
  return format === 'json'
    ? renderArchitectureJson(ctx)
    : renderArchitectureMarkdown(ctx);
}

export function registerGetArchitectureContext(server: McpServer): void {
  server.registerTool(
    'get_architecture_context',
    {
      description: [
        'Return the assembled architecture context for a cctree tree:',
        'tree info plus, for every committed child session, its TL;DR,',
        'decisions, artifacts, open questions, next steps, and the union of',
        'file paths touched (hot files).',
        'Use this when the user asks for an architecture diagram, summary, or',
        'visualization of the current branch — then synthesize the output',
        'yourself in whatever format fits best (Mermaid flowchart/sequence/',
        'state/class/ER, a standalone HTML+CSS+JS page, an ASCII diagram, etc.).',
        'Does NOT call any external API.',
      ].join(' '),
      inputSchema: {
        tree: z
          .string()
          .optional()
          .describe(
            'Name or slug of the cctree tree. Defaults to the active tree.',
          ),
        format: z
          .enum(['markdown', 'json'])
          .optional()
          .describe(
            'Serialization. "markdown" (default) is human/LLM-readable; "json" is structured for tools.',
          ),
      },
    },
    async ({ tree, format }) => {
      try {
        const text = await getArchitectureContextTool({ tree, format });
        return { content: [{ type: 'text' as const, text }] };
      } catch (err) {
        const message =
          err instanceof ArchitectureContextError
            ? err.message
            : (err as Error).message;
        return {
          content: [{ type: 'text' as const, text: message }],
          isError: true,
        };
      }
    },
  );
}
