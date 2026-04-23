import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { listTrees, resolveTree } from '../lib/storage.js';
import { renderMermaid } from '../lib/mermaid.js';
import { exportToObsidian } from '../lib/obsidian.js';
import type { TreeConfig } from '../types/index.js';

export interface ExportMermaidCliOptions {
  tree?: string;
  output?: string;
}

export interface ExportObsidianCliOptions {
  tree?: string;
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
