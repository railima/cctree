import { readFile } from 'node:fs/promises';
import {
  addContextFiles,
  getActiveTreeOrFail,
  resolveTree,
} from '../lib/storage.js';
import { contextPath } from '../lib/config.js';

export async function contextCommand(_options: { raw?: boolean }): Promise<void> {
  try {
    const tree = await getActiveTreeOrFail();
    const content = await readFile(contextPath(tree.slug), 'utf-8');
    process.stdout.write(content);
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
    process.exit(1);
  }
}

export async function contextAddCommand(
  files: string[],
  options: { tree?: string },
): Promise<void> {
  try {
    const tree = options.tree
      ? await resolveTree(options.tree)
      : await getActiveTreeOrFail();

    const { added } = await addContextFiles(tree.slug, process.cwd(), files);

    console.log(
      `Added ${added.length} file${added.length === 1 ? '' : 's'} to tree "${tree.name}":`,
    );
    for (const name of added) console.log(`  + ${name}`);
    console.log('');
    console.log('Context rebuilt. Subsequent sessions will include these files.');
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
    process.exit(1);
  }
}
