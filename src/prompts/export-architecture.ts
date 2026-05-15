import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  buildArchitectureContext,
  renderArchitectureMarkdown,
} from '../lib/architecture-context.js';

const FORMAT_GUIDE: Record<string, string> = {
  mermaid: [
    'Produce a single Mermaid diagram (no markdown fences) that visualizes the',
    'architectural decisions, components, and flows that emerge across the sessions.',
    'Pick the diagram type that fits the content: flowchart TD/LR for component or',
    'decision graphs, sequenceDiagram for ordered flows, stateDiagram-v2 for',
    'lifecycles, classDiagram for type structures, erDiagram for data models.',
    'Nodes = real concepts (components, modules, decisions, files, services).',
    'Edges = real relationships (depends on, calls, replaces, sequenced after,',
    'produces). Connect sessions through shared artifacts/decisions, not through',
    '"session" nodes. Keep labels short. Do not invent components that are not',
    'implied by the input.',
  ].join(' '),
  html: [
    'Produce a single self-contained HTML document (HTML + inline CSS + inline JS,',
    'no external dependencies) that visualizes the branch architecture. Use SVG,',
    'Canvas, or pure CSS layout — whatever best fits the data. Show decisions,',
    'components, and the relationships between them. Offer to save the file via',
    'the Write tool once the user confirms.',
  ].join(' '),
  ascii: [
    'Produce a single ASCII diagram (boxes, arrows, indentation) inside a code',
    'block that visualizes the branch architecture. Keep it terminal-friendly',
    '(monospace, <= 100 columns).',
  ].join(' '),
  auto: [
    'Pick the output format that best represents what is in the branch:',
    'a Mermaid diagram (flowchart/sequence/state/class/ER), a standalone',
    'HTML+CSS+JS page, or an ASCII diagram. Briefly explain the choice in one',
    'sentence before producing the artifact.',
  ].join(' '),
};

function buildPromptText(format: string, treeName: string, payload: string): string {
  const normalized = format.toLowerCase();
  const guide = FORMAT_GUIDE[normalized] ?? FORMAT_GUIDE.auto;
  return [
    `You are looking at the cctree branch "${treeName}". Below is the assembled`,
    'architecture context: every committed child session with its TL;DR,',
    'decisions, artifacts, and the file paths touched across them.',
    '',
    `Task: ${guide}`,
    '',
    'If the input is too thin to derive structure (e.g. a single TL;DR with no',
    'decisions), produce a minimal but valid artifact and add a short note about',
    'why structure is sparse.',
    '',
    '---',
    '',
    payload,
  ].join('\n');
}

export function registerExportArchitecturePrompt(server: McpServer): void {
  server.registerPrompt(
    'export_architecture',
    {
      title: 'Export branch architecture',
      description: [
        'Load the cctree branch context (committed sessions: TL;DRs, decisions,',
        'artifacts) and ask Claude to synthesize it into an architecture artifact.',
        'Format hint is free-text: "mermaid" (flowchart/sequence/state/class/ER),',
        '"html" (standalone page with HTML+CSS+JS), "ascii", or "auto" (default).',
      ].join(' '),
      argsSchema: {
        tree: z
          .string()
          .optional()
          .describe('Tree name or slug. Defaults to the active tree.'),
        format: z
          .string()
          .optional()
          .describe('Output hint: "mermaid", "html", "ascii", "auto". Default "auto".'),
      },
    },
    async ({ tree, format }) => {
      const ctx = await buildArchitectureContext(tree);
      const payload = renderArchitectureMarkdown(ctx);
      const text = buildPromptText(format ?? 'auto', ctx.tree.name, payload);
      return {
        messages: [
          {
            role: 'user',
            content: { type: 'text', text },
          },
        ],
      };
    },
  );
}
