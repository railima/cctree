import {
  listTrees,
  getActiveTree,
  loadChildSummary,
} from '../lib/storage.js';
import { formatTree } from '../utils/format.js';
import { tagsMatch } from '../lib/tags.js';
import { parseSummarySections } from '../lib/summary-sections.js';
import type { ChildSession, TreeConfig } from '../types/index.js';

export interface ListOptions {
  all?: boolean;
  tag?: string;
  search?: string;
}

async function summaryMatchesQuery(
  treeSlug: string,
  child: ChildSession,
  needle: string,
): Promise<boolean> {
  if (child.status !== 'committed') return false;
  let raw: string;
  try {
    raw = await loadChildSummary(treeSlug, child.slug);
  } catch {
    return false;
  }
  const parsed = parseSummarySections(raw);
  if (parsed.tldr.toLowerCase().includes(needle)) return true;
  if (parsed.decisions.some((d) => d.toLowerCase().includes(needle))) {
    return true;
  }
  if (parsed.artifactsCreated.some((a) => a.toLowerCase().includes(needle))) {
    return true;
  }
  return false;
}

async function childMatchesFilters(
  treeSlug: string,
  child: ChildSession,
  options: ListOptions,
): Promise<boolean> {
  if (options.tag && !tagsMatch(child.tags, options.tag)) {
    return false;
  }
  if (options.search) {
    const needle = options.search.toLowerCase();
    const hitsName =
      child.name.toLowerCase().includes(needle) ||
      child.slug.toLowerCase().includes(needle);
    const hitsTags = (child.tags ?? []).some((t) =>
      t.toLowerCase().includes(needle),
    );
    if (
      !hitsName &&
      !hitsTags &&
      !(await summaryMatchesQuery(treeSlug, child, needle))
    ) {
      return false;
    }
  }
  return true;
}

async function applyFilters(
  tree: TreeConfig,
  options: ListOptions,
): Promise<TreeConfig | null> {
  if (!options.tag && !options.search) return tree;

  const treeNameHits =
    options.search !== undefined &&
    (tree.name.toLowerCase().includes(options.search.toLowerCase()) ||
      tree.slug.toLowerCase().includes(options.search.toLowerCase()));

  const filtered: ChildSession[] = [];
  for (const child of tree.children) {
    if (await childMatchesFilters(tree.slug, child, options)) {
      filtered.push(child);
    }
  }

  if (filtered.length === 0 && !treeNameHits) return null;
  return { ...tree, children: filtered };
}

export async function listCommand(options: ListOptions): Promise<void> {
  try {
    const filterApplied = Boolean(options.tag || options.search);
    const activeTree = await getActiveTree();

    if (!options.all && activeTree && !filterApplied) {
      console.log(formatTree(activeTree, true));
      return;
    }

    const trees = filterApplied || options.all
      ? await listTrees()
      : activeTree
        ? [activeTree]
        : await listTrees();

    if (trees.length === 0) {
      console.log('No trees found. Run "cctree init <name>" to create one.');
      return;
    }

    const filtered: TreeConfig[] = [];
    for (const tree of trees) {
      const result = await applyFilters(tree, options);
      if (result !== null) filtered.push(result);
    }

    if (filtered.length === 0) {
      const filterDesc = [
        options.tag ? `tag="${options.tag}"` : null,
        options.search ? `search="${options.search}"` : null,
      ]
        .filter(Boolean)
        .join(', ');
      console.log(`No sessions match ${filterDesc}.`);
      return;
    }

    for (let i = 0; i < filtered.length; i++) {
      const tree = filtered[i];
      const isActive = activeTree?.slug === tree.slug;
      console.log(formatTree(tree, isActive));
      if (i < filtered.length - 1) console.log('');
    }
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
    process.exit(1);
  }
}
