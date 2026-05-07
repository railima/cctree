import Anthropic from '@anthropic-ai/sdk';
import type { TreeConfig } from '../types/index.js';
import { parseSummarySections } from './summary-sections.js';

export class ArchitectureMermaidError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArchitectureMermaidError';
  }
}

export interface ArchitectureMermaidUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
}

export interface ArchitectureMermaidResult {
  diagram: string;
  usage: ArchitectureMermaidUsage;
  model: string;
}

const SYSTEM_PROMPT = [
  'You are a senior software architect. You receive a JSON object describing one cctree tree and the committed sessions inside it.',
  'Each session has a TL;DR, a list of decisions, and a list of artifacts (file paths touched).',
  '',
  'Your job: produce a single Mermaid diagram that visualizes the architectural decisions, dependencies, and flows that emerge across these sessions.',
  '',
  'Rules:',
  '- Output ONLY the raw Mermaid source. No markdown fences (```), no prose, no commentary.',
  '- The first line MUST be one of: "graph TD", "graph LR", "flowchart TD", "flowchart LR", "sequenceDiagram", "stateDiagram-v2", "classDiagram", or "erDiagram".',
  '- Choose the diagram type that best fits the content (flowchart for component/decision graphs, sequenceDiagram for ordered flows, stateDiagram-v2 for lifecycles).',
  '- Nodes should represent meaningful concepts (components, modules, decisions, files, services). Edges should represent real relationships (depends on, calls, replaces, sequenced after, produces).',
  '- Use short, readable labels. Quote labels with spaces.',
  '- If multiple sessions share artifacts or decisions, connect them through the shared concept rather than through "session" nodes.',
  '- If the input is too thin to derive structure (e.g. a single TL;DR with no decisions), produce a minimal but valid diagram and add a single explanatory node.',
  '- Never invent components that are not implied by the input.',
].join('\n');

const VALID_HEADER =
  /^(graph\s+(TD|LR|BT|RL)|flowchart\s+(TD|LR|BT|RL)|sequenceDiagram|stateDiagram(-v2)?|classDiagram|erDiagram|journey)\b/;

const DEFAULT_MODEL = 'claude-sonnet-4-6';
const DEFAULT_MAX_TOKENS = 4096;

interface SessionInput {
  name: string;
  slug: string;
  tldr: string;
  decisions: string[];
  artifacts: string[];
  committed_at: string | null;
}

function buildUserMessage(tree: TreeConfig, sessions: SessionInput[]): string {
  return JSON.stringify(
    {
      tree_name: tree.name,
      tree_slug: tree.slug,
      sessions,
    },
    null,
    2,
  );
}

function stripFences(text: string): string {
  let out = text.trim();
  out = out.replace(/^```(?:mermaid)?\s*\n?/i, '');
  out = out.replace(/\n?```\s*$/i, '');
  return out.trim();
}

export interface RenderArchitectureOptions {
  apiKey?: string;
  model?: string;
  maxTokens?: number;
  client?: Anthropic;
}

export async function renderArchitectureMermaid(
  tree: TreeConfig,
  summaries: Map<string, string>,
  options: RenderArchitectureOptions = {},
): Promise<ArchitectureMermaidResult> {
  const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!options.client && !apiKey) {
    throw new ArchitectureMermaidError(
      'ANTHROPIC_API_KEY is not set. Either export it (export ANTHROPIC_API_KEY=...) or run "cctree export mermaid" without --architecture for the structural diagram.',
    );
  }

  const sessions: SessionInput[] = [];
  for (const child of tree.children) {
    if (child.status !== 'committed') continue;
    const raw = summaries.get(child.slug);
    if (!raw) continue;
    const parsed = parseSummarySections(raw);
    if (
      parsed.tldr.length === 0 &&
      parsed.decisions.length === 0 &&
      parsed.artifactsCreated.length === 0
    ) {
      continue;
    }
    sessions.push({
      name: child.name,
      slug: child.slug,
      tldr: parsed.tldr,
      decisions: parsed.decisions,
      artifacts: parsed.artifactsCreated,
      committed_at: child.committed_at ?? null,
    });
  }

  if (sessions.length === 0) {
    throw new ArchitectureMermaidError(
      `Tree "${tree.name}" has no committed sessions with TL;DR/Decisions/Artifacts to derive an architecture from. Commit at least one session via commit_to_parent first.`,
    );
  }

  const client =
    options.client ?? new Anthropic({ apiKey: apiKey as string });
  const model = options.model ?? DEFAULT_MODEL;
  const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;

  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        { role: 'user', content: buildUserMessage(tree, sessions) },
      ],
    });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      throw new ArchitectureMermaidError(
        'Anthropic API key was rejected. Check that ANTHROPIC_API_KEY is valid.',
      );
    }
    if (err instanceof Anthropic.RateLimitError) {
      throw new ArchitectureMermaidError(
        'Anthropic API rate-limited the request. Try again in a moment.',
      );
    }
    if (err instanceof Anthropic.APIError) {
      throw new ArchitectureMermaidError(
        `Anthropic API error (status ${err.status}): ${err.message}`,
      );
    }
    throw err;
  }

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();

  if (text.length === 0) {
    throw new ArchitectureMermaidError(
      'The model returned an empty response. Re-run, or fall back to "cctree export mermaid" without --architecture.',
    );
  }

  const diagram = stripFences(text);

  if (!VALID_HEADER.test(diagram)) {
    throw new ArchitectureMermaidError(
      [
        'The model did not return a recognized Mermaid diagram header.',
        'First 200 chars of the output:',
        diagram.slice(0, 200),
      ].join('\n'),
    );
  }

  return {
    diagram: diagram.endsWith('\n') ? diagram : `${diagram}\n`,
    model: response.model,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheCreationInputTokens:
        response.usage.cache_creation_input_tokens ?? 0,
      cacheReadInputTokens: response.usage.cache_read_input_tokens ?? 0,
    },
  };
}

export const __test__ = {
  stripFences,
  VALID_HEADER,
  buildUserMessage,
};
