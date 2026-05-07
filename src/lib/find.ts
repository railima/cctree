import {
  listTrees as defaultListTrees,
  loadChildSummary as defaultLoadChildSummary,
} from './storage.js';
import { parseSummarySections } from './summary-sections.js';
import type { ChildSession, TreeConfig } from '../types/index.js';

export type FindField =
  | 'tree-name'
  | 'tree-slug'
  | 'child-name'
  | 'child-slug'
  | 'tag'
  | 'tldr'
  | 'decision'
  | 'artifact';

export interface FindMatch {
  tree: TreeConfig;
  child: ChildSession | null;
  field: FindField;
  excerpt: string;
}

export interface FindOptions {
  /** Inject custom tree loader (used in tests). */
  listTrees?: () => Promise<TreeConfig[]>;
  /** Inject custom summary loader (used in tests). */
  loadChildSummary?: (treeSlug: string, childSlug: string) => Promise<string>;
}

function includesCi(haystack: string | undefined, needle: string): boolean {
  if (!haystack) return false;
  return haystack.toLowerCase().includes(needle);
}

export async function findInTrees(
  query: string,
  options: FindOptions = {},
): Promise<FindMatch[]> {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return [];

  const listTrees = options.listTrees ?? defaultListTrees;
  const loadChildSummary =
    options.loadChildSummary ?? defaultLoadChildSummary;

  const trees = await listTrees();
  const matches: FindMatch[] = [];

  for (const tree of trees) {
    if (includesCi(tree.name, needle)) {
      matches.push({
        tree,
        child: null,
        field: 'tree-name',
        excerpt: tree.name,
      });
    } else if (includesCi(tree.slug, needle)) {
      matches.push({
        tree,
        child: null,
        field: 'tree-slug',
        excerpt: tree.slug,
      });
    }

    for (const child of tree.children) {
      if (includesCi(child.name, needle)) {
        matches.push({
          tree,
          child,
          field: 'child-name',
          excerpt: child.name,
        });
      } else if (includesCi(child.slug, needle)) {
        matches.push({
          tree,
          child,
          field: 'child-slug',
          excerpt: child.slug,
        });
      }

      for (const tag of child.tags ?? []) {
        if (includesCi(tag, needle)) {
          matches.push({
            tree,
            child,
            field: 'tag',
            excerpt: `#${tag}`,
          });
        }
      }

      if (child.status !== 'committed') continue;

      let raw: string;
      try {
        raw = await loadChildSummary(tree.slug, child.slug);
      } catch {
        continue;
      }

      const parsed = parseSummarySections(raw);

      if (includesCi(parsed.tldr, needle)) {
        matches.push({
          tree,
          child,
          field: 'tldr',
          excerpt: parsed.tldr,
        });
      }
      for (const d of parsed.decisions) {
        if (includesCi(d, needle)) {
          matches.push({
            tree,
            child,
            field: 'decision',
            excerpt: d,
          });
        }
      }
      for (const a of parsed.artifactsCreated) {
        if (includesCi(a, needle)) {
          matches.push({
            tree,
            child,
            field: 'artifact',
            excerpt: a,
          });
        }
      }
    }
  }

  return matches;
}

export function formatFindMatches(matches: FindMatch[], query: string): string {
  if (matches.length === 0) {
    return `No matches for "${query}".`;
  }

  const byTree = new Map<string, FindMatch[]>();
  for (const m of matches) {
    const key = m.tree.slug;
    const arr = byTree.get(key) ?? [];
    arr.push(m);
    byTree.set(key, arr);
  }

  const lines: string[] = [];
  for (const [, group] of byTree) {
    const tree = group[0].tree;
    lines.push(`${tree.name} (${tree.slug})`);
    for (const m of group) {
      const child = m.child ? ` > ${m.child.name}` : '';
      const excerpt =
        m.excerpt.length > 140 ? `${m.excerpt.slice(0, 140)}…` : m.excerpt;
      lines.push(`  ${m.field}${child}: ${excerpt}`);
    }
    lines.push('');
  }

  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();

  lines.push('');
  lines.push(`${matches.length} match${matches.length === 1 ? '' : 'es'}.`);
  return lines.join('\n');
}
