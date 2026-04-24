import type { ChildSession, TreeConfig } from '../types/index.js';
import { renderMermaid } from './mermaid.js';
import { renderMermaidGantt } from './mermaid-gantt.js';
import { parseSummarySections } from './summary-sections.js';
import { extractFilePaths } from './summary-parser.js';

export interface ReportBuildInput {
  tree: TreeConfig;
  includedChildren: ChildSession[];
  summaries: Map<string, string>; // childSlug -> raw summary content
  author: string;
  generatedAt: Date;
}

function isoDay(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function countsFor(children: ChildSession[]): { committed: number; active: number; parked: number } {
  const c = { committed: 0, active: 0, parked: 0 };
  for (const child of children) {
    if (child.status === 'committed') c.committed += 1;
    else if (child.status === 'active') c.active += 1;
    else c.parked += 1;
  }
  return c;
}

function yamlString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function groupBulletsByChild(
  children: ChildSession[],
  summaries: Map<string, string>,
  section: 'decisions' | 'artifactsCreated' | 'openQuestions' | 'nextSteps',
): Array<{ child: ChildSession; items: string[] }> {
  const out: Array<{ child: ChildSession; items: string[] }> = [];
  for (const child of children) {
    const raw = summaries.get(child.slug);
    if (!raw) continue;
    const parsed = parseSummarySections(raw);
    const items = parsed[section];
    if (items.length > 0) out.push({ child, items });
  }
  return out;
}

function renderGroupedSection(
  title: string,
  groups: Array<{ child: ChildSession; items: string[] }>,
  emptyMessage: string,
): string[] {
  const lines: string[] = [];
  lines.push(`## ${title}`);
  lines.push('');
  if (groups.length === 0) {
    lines.push(`_${emptyMessage}_`);
    lines.push('');
    return lines;
  }
  for (const group of groups) {
    lines.push(`### From _${group.child.name}_`);
    for (const item of group.items) lines.push(`- ${item}`);
    lines.push('');
  }
  return lines;
}

interface FileMention {
  path: string;
  sessions: string[];
}

function buildFileMentions(
  children: ChildSession[],
  summaries: Map<string, string>,
): FileMention[] {
  const map = new Map<string, Set<string>>();
  for (const child of children) {
    const raw = summaries.get(child.slug);
    if (!raw) continue;
    const paths = extractFilePaths(raw);
    for (const path of paths) {
      if (!map.has(path)) map.set(path, new Set());
      map.get(path)!.add(child.name);
    }
  }
  return Array.from(map.entries())
    .map(([path, sessions]) => ({ path, sessions: Array.from(sessions) }))
    .sort((a, b) => {
      if (b.sessions.length !== a.sessions.length) {
        return b.sessions.length - a.sessions.length;
      }
      return a.path.localeCompare(b.path);
    });
}

function renderHotFiles(mentions: FileMention[]): string[] {
  const lines: string[] = [];
  lines.push('## Hot files');
  lines.push('');
  if (mentions.length === 0) {
    lines.push('_No file paths detected in the selected summaries._');
    lines.push('');
    return lines;
  }
  lines.push('Files mentioned across the selected sessions, ranked by how many sessions touched them. The top of this list is where the product surface is concentrating — a natural signal for merge risk and architectural pressure.');
  lines.push('');
  lines.push('| File | Sessions |');
  lines.push('| --- | --- |');
  for (const m of mentions) {
    const sessionsList = m.sessions.map((s) => `_${s}_`).join(', ');
    lines.push(`| \`${m.path}\` | ${m.sessions.length} — ${sessionsList} |`);
  }
  lines.push('');
  return lines;
}

function renderStatusBreakdown(children: ChildSession[]): string[] {
  const lines: string[] = [];
  lines.push('## Session breakdown');
  lines.push('');

  const committed = children.filter((c) => c.status === 'committed');
  const active = children.filter((c) => c.status === 'active');
  const parked = children.filter((c) => c.status === 'abandoned');

  if (committed.length > 0) {
    lines.push('### Delivered');
    for (const c of committed) {
      const date = c.committed_at ? ` · committed ${isoDay(c.committed_at)}` : '';
      lines.push(`- **${c.name}**${date}`);
    }
    lines.push('');
  }

  if (active.length > 0) {
    lines.push('### In progress');
    for (const c of active) {
      lines.push(`- **${c.name}** · started ${isoDay(c.created_at)}`);
    }
    lines.push('');
  }

  if (parked.length > 0) {
    lines.push('### Explored (parked)');
    lines.push('');
    lines.push('_Paths explored but not pursued. Each one represents a conscious decision not to follow a direction — that is a valuable contribution to the product\'s evolution even without delivering code._');
    lines.push('');
    for (const c of parked) {
      lines.push(`- **${c.name}** · explored ${isoDay(c.created_at)}`);
    }
    lines.push('');
  }

  return lines;
}

function renderSessionDetail(
  children: ChildSession[],
  summaries: Map<string, string>,
): string[] {
  const lines: string[] = [];
  lines.push('## Session detail');
  lines.push('');

  for (const child of children) {
    const raw = summaries.get(child.slug);
    const statusLabel =
      child.status === 'committed'
        ? `committed ${isoDay(child.committed_at ?? child.created_at)}`
        : child.status === 'active'
          ? `in progress since ${isoDay(child.created_at)}`
          : `explored on ${isoDay(child.created_at)} (parked)`;

    lines.push(`<details><summary><strong>${child.name}</strong> — ${statusLabel}</summary>`);
    lines.push('');
    if (raw) {
      lines.push(raw.trim());
    } else {
      lines.push('_No summary file available for this session._');
    }
    lines.push('');
    lines.push('</details>');
    lines.push('');
  }

  return lines;
}

export function renderReport(input: ReportBuildInput): string {
  const { tree, includedChildren, summaries, author, generatedAt } = input;
  const counts = countsFor(includedChildren);
  const totalSelected = includedChildren.length;
  const totalInTree = tree.children.length;
  const scope = totalSelected === totalInTree
    ? 'all sessions'
    : `${totalSelected} of ${totalInTree} sessions`;

  const lines: string[] = [];

  lines.push('---');
  lines.push(`author: ${yamlString(author)}`);
  lines.push(`generated: ${isoDay(generatedAt)}`);
  lines.push(`tree: ${tree.slug}`);
  lines.push(`tree-name: ${yamlString(tree.name)}`);
  lines.push(`scope: ${yamlString(scope)}`);
  lines.push('tags: [cctree, cctree-report]');
  lines.push('---');
  lines.push('');

  lines.push(`# ${tree.name} — progress report`);
  lines.push('');
  lines.push(`**Author**: ${author}`);
  lines.push(`**Generated**: ${isoDay(generatedAt)}`);
  lines.push(`**Tree**: \`${tree.slug}\` (created ${isoDay(tree.created_at)})`);
  lines.push(`**Scope**: ${scope}`);
  const breakdownParts: string[] = [];
  if (counts.committed) breakdownParts.push(`${counts.committed} delivered`);
  if (counts.active) breakdownParts.push(`${counts.active} in progress`);
  if (counts.parked) breakdownParts.push(`${counts.parked} parked`);
  lines.push(`**Breakdown**: ${breakdownParts.join(' · ') || 'no sessions selected'}`);
  lines.push('');

  if (includedChildren.length === 0) {
    lines.push('_No sessions match the requested filter._');
    lines.push('');
    return lines.join('\n');
  }

  const decisionGroups = groupBulletsByChild(includedChildren, summaries, 'decisions');
  lines.push(
    ...renderGroupedSection(
      'Decisions',
      decisionGroups,
      'No decisions recorded in the selected summaries.',
    ),
  );

  const openGroups = groupBulletsByChild(includedChildren, summaries, 'openQuestions');
  lines.push(
    ...renderGroupedSection(
      'Open questions',
      openGroups,
      'No open questions recorded — nothing flagged as needing follow-up.',
    ),
  );

  const artifactGroups = groupBulletsByChild(includedChildren, summaries, 'artifactsCreated');
  lines.push(
    ...renderGroupedSection(
      'Artifacts delivered',
      artifactGroups,
      'No artifacts recorded in the selected summaries.',
    ),
  );

  const nextStepsGroups = groupBulletsByChild(includedChildren, summaries, 'nextSteps');
  if (nextStepsGroups.length > 0) {
    lines.push(
      ...renderGroupedSection(
        'Next steps',
        nextStepsGroups,
        'No next steps recorded.',
      ),
    );
  }

  const fileMentions = buildFileMentions(includedChildren, summaries);
  lines.push(...renderHotFiles(fileMentions));

  lines.push('## Timeline');
  lines.push('');
  lines.push('```mermaid');
  lines.push(
    renderMermaidGantt(tree, includedChildren, {
      title: `${tree.name} — ${author}`,
      now: generatedAt,
    }).trimEnd(),
  );
  lines.push('```');
  lines.push('');

  lines.push('## Structure');
  lines.push('');
  lines.push('```mermaid');
  // For the structural diagram we render a tree that only contains the
  // included children so the picture matches the report scope.
  const scopedTree: TreeConfig = { ...tree, children: includedChildren };
  lines.push(renderMermaid([scopedTree]).trimEnd());
  lines.push('```');
  lines.push('');

  lines.push(...renderStatusBreakdown(includedChildren));
  lines.push(...renderSessionDetail(includedChildren, summaries));

  return lines.join('\n');
}
