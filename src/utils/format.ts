import type { TreeConfig, ChildSession } from '../types/index.js';

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';

function statusLabel(status: ChildSession['status']): string {
  switch (status) {
    case 'committed':
      return `${GREEN}committed${RESET}`;
    case 'active':
      return `${YELLOW}active${RESET}`;
    case 'abandoned':
      return `${DIM}abandoned${RESET}`;
  }
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

export function formatTree(tree: TreeConfig, isActive: boolean): string {
  const lines: string[] = [];
  const activeTag = isActive ? ` ${CYAN}(active)${RESET}` : '';
  lines.push(`${BOLD}${tree.name}${RESET}${activeTag}`);

  const children = tree.children;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const isLast = i === children.length - 1;
    const connector = isLast ? '\u2514\u2500\u2500' : '\u251C\u2500\u2500';
    const date = child.committed_at ? shortDate(child.committed_at) : shortDate(child.created_at);
    lines.push(`${connector} [${statusLabel(child.status)}] ${child.name} ${DIM}(${date})${RESET}`);
  }

  if (children.length === 0) {
    lines.push(`${DIM}    (no sessions yet)${RESET}`);
  }

  return lines.join('\n');
}

export function formatTreePlain(tree: TreeConfig): string {
  const lines: string[] = [];
  lines.push(tree.name);

  for (let i = 0; i < tree.children.length; i++) {
    const child = tree.children[i];
    const isLast = i === tree.children.length - 1;
    const connector = isLast ? '\u2514\u2500\u2500' : '\u251C\u2500\u2500';
    lines.push(`${connector} [${child.status}] ${child.name}`);
  }

  return lines.join('\n');
}
