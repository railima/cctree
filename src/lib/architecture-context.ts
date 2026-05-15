import {
  resolveTree,
  loadChildSummary,
  getActiveTree,
} from './storage.js';
import { parseSummarySections } from './summary-sections.js';
import { extractFilePaths } from './summary-parser.js';
import type { TreeConfig } from '../types/index.js';

export class ArchitectureContextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArchitectureContextError';
  }
}

export interface ArchitectureSession {
  name: string;
  slug: string;
  tldr: string;
  decisions: string[];
  artifacts: string[];
  openQuestions: string[];
  nextSteps: string[];
  committed_at: string | null;
}

export interface ArchitectureContext {
  tree: { name: string; slug: string };
  sessions: ArchitectureSession[];
  hotFiles: string[];
}

export async function resolveTreeRef(
  treeNameOrSlug?: string,
): Promise<TreeConfig> {
  if (treeNameOrSlug) return resolveTree(treeNameOrSlug);
  const active = await getActiveTree();
  if (!active) {
    throw new ArchitectureContextError(
      'No active tree. Pass tree="<name>" or run "cctree use <name>" first.',
    );
  }
  return active;
}

export async function buildArchitectureContext(
  treeNameOrSlug?: string,
): Promise<ArchitectureContext> {
  const tree = await resolveTreeRef(treeNameOrSlug);

  const sessions: ArchitectureSession[] = [];
  const hotFilesSet = new Set<string>();

  for (const child of tree.children) {
    if (child.status !== 'committed') continue;
    let raw: string;
    try {
      raw = await loadChildSummary(tree.slug, child.slug);
    } catch {
      continue;
    }
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
      openQuestions: parsed.openQuestions,
      nextSteps: parsed.nextSteps,
      committed_at: child.committed_at ?? null,
    });

    for (const artifact of parsed.artifactsCreated) {
      hotFilesSet.add(artifact);
    }
    for (const path of extractFilePaths(raw)) {
      hotFilesSet.add(path);
    }
  }

  if (sessions.length === 0) {
    throw new ArchitectureContextError(
      `Tree "${tree.name}" has no committed sessions with TL;DR/Decisions/Artifacts to derive an architecture from. Commit at least one session via commit_to_parent first.`,
    );
  }

  return {
    tree: { name: tree.name, slug: tree.slug },
    sessions,
    hotFiles: [...hotFilesSet].sort(),
  };
}

function bulletList(items: string[]): string[] {
  return items.map((it) => `- ${it}`);
}

export function renderArchitectureMarkdown(ctx: ArchitectureContext): string {
  const lines: string[] = [];
  lines.push(`# Branch architecture context: ${ctx.tree.name}`);
  lines.push('');
  lines.push(`Tree slug: \`${ctx.tree.slug}\``);
  lines.push(`Committed sessions: ${ctx.sessions.length}`);
  lines.push('');

  if (ctx.hotFiles.length > 0) {
    lines.push('## Hot files (touched across sessions)');
    lines.push(...bulletList(ctx.hotFiles));
    lines.push('');
  }

  lines.push('## Sessions');
  lines.push('');
  for (const s of ctx.sessions) {
    lines.push(`### ${s.name} (\`${s.slug}\`)`);
    if (s.committed_at) lines.push(`Committed at: ${s.committed_at}`);
    lines.push('');
    if (s.tldr.length > 0) {
      lines.push('**TL;DR**');
      lines.push(s.tldr);
      lines.push('');
    }
    if (s.decisions.length > 0) {
      lines.push('**Decisions**');
      lines.push(...bulletList(s.decisions));
      lines.push('');
    }
    if (s.artifacts.length > 0) {
      lines.push('**Artifacts**');
      lines.push(...bulletList(s.artifacts));
      lines.push('');
    }
    if (s.openQuestions.length > 0) {
      lines.push('**Open questions**');
      lines.push(...bulletList(s.openQuestions));
      lines.push('');
    }
    if (s.nextSteps.length > 0) {
      lines.push('**Next steps**');
      lines.push(...bulletList(s.nextSteps));
      lines.push('');
    }
  }

  return lines.join('\n').trimEnd() + '\n';
}

export function renderArchitectureJson(ctx: ArchitectureContext): string {
  return JSON.stringify(ctx, null, 2);
}
