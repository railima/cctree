import { stat } from 'node:fs/promises';
import { getActiveTree } from '../lib/storage.js';
import { contextPath } from '../lib/config.js';

export async function statusCommand(): Promise<void> {
  const tree = await getActiveTree();

  if (!tree) {
    console.log('No active tree. Run "cctree init <name>" to create one.');
    return;
  }

  const committed = tree.children.filter((c) => c.status === 'committed').length;
  const active = tree.children.filter((c) => c.status === 'active').length;

  let contextSize = 0;
  try {
    const ctxPath = contextPath(tree.slug);
    const s = await stat(ctxPath);
    contextSize = s.size;
  } catch {
    // no context yet
  }

  console.log(`Tree: ${tree.name}`);
  console.log(`Slug: ${tree.slug}`);
  console.log(`Created: ${new Date(tree.created_at).toLocaleDateString()}`);
  console.log(`Working dir: ${tree.cwd}`);
  console.log(`Sessions: ${tree.children.length} total (${committed} committed, ${active} active)`);
  console.log(`Context files: ${tree.initial_context_files.length}`);
  console.log(`Context size: ${(contextSize / 1024).toFixed(1)} KB`);
}
