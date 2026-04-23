import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { listTrees, resolveTree } from '../lib/storage.js';
import { renderMermaid } from '../lib/mermaid.js';
import type { TreeConfig } from '../types/index.js';

export interface ExportMermaidCliOptions {
  tree?: string;
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
