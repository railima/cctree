import {
  listTrees,
  loadTree,
  readActiveSession,
} from '../lib/storage.js';
import type { ChildSession, TreeConfig } from '../types/index.js';

export interface StatuslineOptions {
  format?: string;
}

export const DEFAULT_STATUSLINE_FORMAT = '{tree} › {child}';

const PLACEHOLDER_RE = /\{(\w+)\}/g;
const STDIN_TIMEOUT_MS = 500;

function render(template: string, vars: Record<string, string>): string {
  return template.replace(PLACEHOLDER_RE, (_, key) => vars[key] ?? '');
}

function buildVars(tree: TreeConfig, child: ChildSession | undefined, childSlugFallback: string): Record<string, string> {
  const committed = tree.children.filter((c) => c.status === 'committed').length;
  const active = tree.children.filter((c) => c.status === 'active').length;
  return {
    tree: tree.name,
    tree_slug: tree.slug,
    child: child?.name ?? childSlugFallback,
    child_slug: child?.slug ?? childSlugFallback,
    committed: String(committed),
    active: String(active),
    total: String(tree.children.length),
  };
}

export async function resolveBySessionName(
  sessionName: string,
): Promise<{ tree: TreeConfig; child: ChildSession } | null> {
  const trees = await listTrees();
  for (const tree of trees) {
    const prefix = `${tree.name} > `;
    if (!sessionName.startsWith(prefix)) continue;
    const childName = sessionName.slice(prefix.length);
    const child = tree.children.find((c) => c.name === childName);
    if (child) return { tree, child };
  }
  return null;
}

interface StatuslineInput {
  sessionName?: string;
}

export function parseStdinInput(raw: string): StatuslineInput | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const data = JSON.parse(trimmed) as { session_name?: unknown };
    if (typeof data.session_name === 'string' && data.session_name.length > 0) {
      return { sessionName: data.session_name };
    }
    return {};
  } catch {
    return null;
  }
}

async function readStdin(timeoutMs: number): Promise<string> {
  if (process.stdin.isTTY) return '';

  return await new Promise<string>((resolvePromise) => {
    const chunks: Buffer[] = [];
    let settled = false;

    const finish = (): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      process.stdin.removeListener('data', onData);
      process.stdin.removeListener('end', onEnd);
      process.stdin.removeListener('error', onEnd);
      resolvePromise(Buffer.concat(chunks).toString('utf-8'));
    };

    const onData = (chunk: Buffer): void => {
      chunks.push(chunk);
    };
    const onEnd = (): void => finish();
    const timer = setTimeout(finish, timeoutMs);

    process.stdin.on('data', onData);
    process.stdin.once('end', onEnd);
    process.stdin.once('error', onEnd);
  });
}

export async function buildStatusline(
  options: StatuslineOptions = {},
  input: StatuslineInput | null = null,
): Promise<string | null> {
  let tree: TreeConfig | null = null;
  let child: ChildSession | undefined;
  let childSlugFallback = '';

  if (input?.sessionName) {
    const resolved = await resolveBySessionName(input.sessionName);
    if (resolved) {
      tree = resolved.tree;
      child = resolved.child;
      childSlugFallback = resolved.child.slug;
    }
  }

  if (!tree) {
    const session = await readActiveSession();
    if (!session) return null;
    try {
      tree = await loadTree(session.tree);
    } catch {
      return null;
    }
    child = tree.children.find((c) => c.slug === session.child);
    childSlugFallback = session.child;
  }

  return render(options.format ?? DEFAULT_STATUSLINE_FORMAT, buildVars(tree, child, childSlugFallback));
}

export async function statuslineCommand(options: StatuslineOptions): Promise<void> {
  try {
    const raw = await readStdin(STDIN_TIMEOUT_MS);
    const input = raw ? parseStdinInput(raw) : null;
    const output = await buildStatusline(options, input);
    if (output !== null) process.stdout.write(output);
  } catch {
    // Statuslines are invoked on every prompt; never fail loudly.
  }
}
