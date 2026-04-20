import {
  abandonChild,
  findChildByNameOrSlug,
  getActiveTreeOrFail,
  resolveTree,
} from '../lib/storage.js';

export interface AbandonCliOptions {
  delete?: boolean;
  tree?: string;
}

export async function abandonCommand(
  nameOrSlug: string,
  options: AbandonCliOptions,
): Promise<void> {
  try {
    const tree = options.tree
      ? await resolveTree(options.tree)
      : await getActiveTreeOrFail();

    const child = await findChildByNameOrSlug(tree, nameOrSlug);
    if (!child) {
      console.error(`Session "${nameOrSlug}" not found in tree "${tree.name}".`);
      if (tree.children.length > 0) {
        console.error('Available sessions:');
        for (const c of tree.children) {
          console.error(`  - ${c.name} (${c.slug}) [${c.status}]`);
        }
      }
      process.exit(1);
    }

    const result = await abandonChild(tree.slug, child.slug, {
      delete: options.delete,
    });

    if (result.mode === 'marked') {
      console.log(`Marked "${child.name}" as abandoned in tree "${tree.name}".`);
      console.log('It will no longer appear in accumulated context.');
      return;
    }

    console.log(`Deleted "${child.name}" from tree "${tree.name}".`);
    if (result.removedWorktree) {
      console.log(`  Worktree removed: ${result.removedWorktree}`);
    }
    if (result.removedBranch) {
      console.log(`  Branch removed:   ${result.removedBranch}`);
    }
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
    process.exit(1);
  }
}
