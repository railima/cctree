import type { ChildSession, TreeConfig } from '../types/index.js';

export interface GanttRenderOptions {
  title?: string;
  now?: Date;
}

function isoDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function nextDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return isoDay(d.toISOString());
}

function sanitizeTaskName(name: string): string {
  return name
    .replace(/:/g, ' —')
    .replace(/#/g, '')
    .replace(/[\r\n]+/g, ' ')
    .trim();
}

function statusTag(status: ChildSession['status']): string {
  switch (status) {
    case 'committed': return 'done';
    case 'active': return 'active';
    case 'abandoned': return '';
  }
}

function barRange(
  child: ChildSession,
  now: Date,
): { start: string; end: string } {
  const start = isoDay(child.created_at);
  if (child.status === 'committed' && child.committed_at) {
    const end = isoDay(child.committed_at);
    // Gantt rejects zero-length bars — make same-day tasks span 1d.
    return { start, end: end === start ? nextDay(start) : end };
  }
  if (child.status === 'active') {
    const today = isoDay(now.toISOString());
    return { start, end: today === start ? nextDay(start) : today };
  }
  // abandoned: we don't track when it was abandoned, so draw a 1-day marker
  return { start, end: nextDay(start) };
}

export function renderMermaidGantt(
  tree: TreeConfig,
  children: ChildSession[],
  options: GanttRenderOptions = {},
): string {
  const now = options.now ?? new Date();
  const title = options.title ?? `Sessions timeline — ${tree.name}`;

  const lines: string[] = [];
  lines.push('gantt');
  lines.push(`    title ${sanitizeTaskName(title)}`);
  lines.push('    dateFormat YYYY-MM-DD');
  lines.push('    axisFormat %b %d');

  if (children.length === 0) {
    lines.push(`    section ${sanitizeTaskName(tree.name)}`);
    lines.push('    (no sessions to show) : milestone, 0d');
    return lines.join('\n') + '\n';
  }

  lines.push(`    section ${sanitizeTaskName(tree.name)}`);
  for (const child of children) {
    const { start, end } = barRange(child, now);
    const tag = statusTag(child.status);
    const tagPart = tag ? `${tag}, ` : '';
    const taskName = sanitizeTaskName(child.name);
    lines.push(`    ${taskName} :${tagPart}${start}, ${end}`);
  }

  return lines.join('\n') + '\n';
}
