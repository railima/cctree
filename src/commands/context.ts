import { readFile } from 'node:fs/promises';
import { getActiveTreeOrFail } from '../lib/storage.js';
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
