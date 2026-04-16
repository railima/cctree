import { resolve } from 'node:path';
import { createTree } from '../lib/storage.js';

export async function initCommand(
  name: string,
  options: { context?: string[] },
): Promise<void> {
  const cwd = process.cwd();
  const contextFiles = options.context ?? [];

  try {
    const tree = await createTree(name, cwd, contextFiles);
    console.log(`Tree "${tree.name}" created.`);
    console.log(`  Slug: ${tree.slug}`);
    console.log(`  Path: ${resolve(process.env.HOME ?? '~', '.cctree', 'trees', tree.slug)}`);
    if (tree.initial_context_files.length > 0) {
      console.log(`  Context files: ${tree.initial_context_files.join(', ')}`);
    }
    console.log('');
    console.log('Next: run "cctree branch <name>" to create your first session.');
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
    process.exit(1);
  }
}
