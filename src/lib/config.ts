import { homedir } from 'node:os';
import { join } from 'node:path';

const BASE_DIR = join(homedir(), '.cctree');

export const paths = {
  base: BASE_DIR,
  trees: join(BASE_DIR, 'trees'),
  activeTree: join(BASE_DIR, 'active-tree'),
  activeSession: join(BASE_DIR, 'active-session.json'),
} as const;

export function treePath(slug: string): string {
  return join(paths.trees, slug);
}

export function treeJsonPath(slug: string): string {
  return join(paths.trees, slug, 'tree.json');
}

export function contextPath(slug: string): string {
  return join(paths.trees, slug, 'context.md');
}

export function initialContextDir(slug: string): string {
  return join(paths.trees, slug, 'initial-context');
}

export function childrenDir(slug: string): string {
  return join(paths.trees, slug, 'children');
}

export function childSummaryPath(treeSlug: string, childSlug: string): string {
  return join(paths.trees, treeSlug, 'children', `${childSlug}.md`);
}

export function injectContextPath(slug: string): string {
  return join(paths.trees, slug, '.inject-context.md');
}

export const CONTEXT_HOOK_MAX_CHARS = 9500;
