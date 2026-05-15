import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  listTrees,
  loadChildSummary,
  resolveTree,
} from '../lib/storage.js';
import { renderMermaid } from '../lib/mermaid.js';
import { exportToObsidian } from '../lib/obsidian.js';
import { renderReport } from '../lib/report.js';
import { resolveAuthor } from '../lib/author.js';
import type { ChildSession, TreeConfig } from '../types/index.js';

export interface ExportMermaidCliOptions {
  tree?: string;
  output?: string;
}

export interface ExportObsidianCliOptions {
  tree?: string;
}

export interface ExportReportCliOptions {
  children?: string;
  author?: string;
  output?: string;
}

export async function exportMermaidCommand(
  options: ExportMermaidCliOptions,
): Promise<void> {
  try {
    let trees: TreeConfig[];
    if (options.tree) {
      trees = [await resolveTree(options.tree)];
    } else {
      trees = await listTrees();
    }

    const diagram = renderMermaid(trees);

    if (options.output) {
      const absPath = resolve(process.cwd(), options.output);
      await writeFile(absPath, diagram);
      console.error(`Wrote Mermaid diagram to ${absPath}`);
      return;
    }

    process.stdout.write(diagram);
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
    process.exit(1);
  }
}

export async function exportObsidianCommand(
  vaultPath: string,
  options: ExportObsidianCliOptions,
): Promise<void> {
  try {
    const allTrees = await listTrees();
    const focus = options.tree ? await resolveTree(options.tree) : undefined;

    const result = await exportToObsidian(vaultPath, allTrees, { tree: focus });

    if (focus) {
      console.log(`Wrote Obsidian vault entries for tree "${focus.name}" to ${result.cctreeDir}/${focus.slug}/`);
    } else {
      console.log(`Wrote Obsidian vault entries to ${result.cctreeDir}`);
    }
    console.log(`  Trees:    ${result.treesWritten}`);
    console.log(`  Children: ${result.childrenWritten}`);
    console.log('');
    console.log('Open the vault in Obsidian and check the graph view.');
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
    process.exit(1);
  }
}

function parseChildrenList(raw: string | undefined): string[] | undefined {
  if (!raw) return undefined;
  const list = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return list.length > 0 ? list : undefined;
}

function filterChildren(
  tree: TreeConfig,
  slugs: string[] | undefined,
): ChildSession[] {
  if (!slugs) return tree.children;
  const allowed = new Set(slugs);
  const matched = tree.children.filter((c) => allowed.has(c.slug));
  const missing = slugs.filter((s) => !tree.children.some((c) => c.slug === s));
  if (missing.length > 0) {
    throw new Error(
      `Child slug${missing.length > 1 ? 's' : ''} not found in tree "${tree.name}": ${missing.join(', ')}`,
    );
  }
  return matched;
}

export async function exportReportCommand(
  treeName: string,
  options: ExportReportCliOptions,
): Promise<void> {
  try {
    const tree = await resolveTree(treeName);
    const childrenSlugs = parseChildrenList(options.children);
    const includedChildren = filterChildren(tree, childrenSlugs);

    const summaries = new Map<string, string>();
    for (const child of includedChildren) {
      if (child.status !== 'committed') continue;
      try {
        const raw = await loadChildSummary(tree.slug, child.slug);
        summaries.set(child.slug, raw);
      } catch {
        // missing summary file — intentionally omitted from aggregations
      }
    }

    const author = await resolveAuthor({ override: options.author });

    const report = renderReport({
      tree,
      includedChildren,
      summaries,
      author,
      generatedAt: new Date(),
    });

    if (options.output) {
      const absPath = resolve(process.cwd(), options.output);
      await writeFile(absPath, report);
      console.error(`Wrote progress report to ${absPath}`);
      return;
    }

    process.stdout.write(report);
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
    process.exit(1);
  }
}
