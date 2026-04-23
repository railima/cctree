import type { TreeConfig, ChildSession } from '../types/index.js';

export interface MermaidRenderOptions {
  direction?: 'TD' | 'LR';
}

const STATUS_ICON: Record<ChildSession['status'], string> = {
  committed: '✓',
  active: '⚡',
  abandoned: '✗',
};

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

function slugToId(slug: string): string {
  return slug.replace(/-/g, '_');
}

function escapeLabel(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function treeNodeId(tree: TreeConfig): string {
  return slugToId(tree.slug);
}

function childNodeId(tree: TreeConfig, child: ChildSession): string {
  return `${slugToId(tree.slug)}__${slugToId(child.slug)}`;
}

function treeLabel(tree: TreeConfig): string {
  const counts = {
    committed: 0,
    active: 0,
    abandoned: 0,
  };
  for (const c of tree.children) counts[c.status] += 1;

  const summaryParts: string[] = [];
  if (counts.committed) summaryParts.push(`${counts.committed} committed`);
  if (counts.active) summaryParts.push(`${counts.active} active`);
  if (counts.abandoned) summaryParts.push(`${counts.abandoned} abandoned`);
  const summary = summaryParts.length ? summaryParts.join(' · ') : 'no sessions yet';

  const lines = [
    `<b>${escapeLabel(tree.name)}</b>`,
    `(${escapeLabel(tree.slug)})`,
    escapeLabel(summary),
  ];
  return `"${lines.join('<br/>')}"`;
}

function childLabel(child: ChildSession): string {
  const icon = STATUS_ICON[child.status];
  const dateIso = child.committed_at ?? child.created_at;
  const date = shortDate(dateIso);
  const statusLine =
    child.status === 'committed'
      ? `${icon}${date ? ` ${date}` : ''}`
      : `${icon} ${child.status}`;
  return `"${escapeLabel(child.name)}<br/>${escapeLabel(statusLine)}"`;
}

export function renderMermaid(
  trees: TreeConfig[],
  options: MermaidRenderOptions = {},
): string {
  const direction = options.direction ?? 'TD';
  const lines: string[] = [];
  lines.push(`graph ${direction}`);

  if (trees.length === 0) {
    lines.push('  empty["No trees yet. Run <b>cctree init</b> to create one."]');
    return lines.join('\n') + '\n';
  }

  const treeIds: string[] = [];
  const committedChildIds: string[] = [];
  const activeChildIds: string[] = [];
  const abandonedChildIds: string[] = [];

  for (let t = 0; t < trees.length; t += 1) {
    const tree = trees[t];
    if (t > 0) lines.push('');

    const tId = treeNodeId(tree);
    treeIds.push(tId);
    lines.push(`  ${tId}[${treeLabel(tree)}]`);

    for (const child of tree.children) {
      const cId = childNodeId(tree, child);
      lines.push(`  ${tId} --> ${cId}[${childLabel(child)}]`);
      if (child.status === 'committed') committedChildIds.push(cId);
      else if (child.status === 'active') activeChildIds.push(cId);
      else abandonedChildIds.push(cId);
    }
  }

  lines.push('');
  lines.push('  classDef tree fill:#e7e0ff,stroke:#5b4eaa,color:#000');
  lines.push('  classDef committed fill:#d4edda,stroke:#2d6a4f,color:#000');
  lines.push('  classDef active fill:#fff3cd,stroke:#b68900,color:#000');
  lines.push('  classDef abandoned fill:#e9ecef,stroke:#868e96,color:#6c757d,stroke-dasharray: 5 5');

  lines.push('');
  if (treeIds.length > 0) lines.push(`  class ${treeIds.join(',')} tree`);
  if (committedChildIds.length > 0) lines.push(`  class ${committedChildIds.join(',')} committed`);
  if (activeChildIds.length > 0) lines.push(`  class ${activeChildIds.join(',')} active`);
  if (abandonedChildIds.length > 0) lines.push(`  class ${abandonedChildIds.join(',')} abandoned`);

  return lines.join('\n') + '\n';
}
