import { listTrees, getActiveTree } from '../lib/storage.js';
import { formatTree } from '../utils/format.js';

export async function listCommand(options: { all?: boolean }): Promise<void> {
  try {
    const activeTree = await getActiveTree();

    if (!options.all && activeTree) {
      console.log(formatTree(activeTree, true));
      return;
    }

    const trees = await listTrees();
    if (trees.length === 0) {
      console.log('No trees found. Run "cctree init <name>" to create one.');
      return;
    }

    for (let i = 0; i < trees.length; i++) {
      const tree = trees[i];
      const isActive = activeTree?.slug === tree.slug;
      console.log(formatTree(tree, isActive));
      if (i < trees.length - 1) console.log('');
    }
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
    process.exit(1);
  }
}
