import {
  getActiveTreeOrFail,
  renameTree,
  resolveTree,
} from '../lib/storage.js';

export interface RenameCliOptions {
  slug?: string;
  tree?: string;
}

export async function renameCommand(
  newName: string,
  options: RenameCliOptions,
): Promise<void> {
  try {
    const tree = options.tree
      ? await resolveTree(options.tree)
      : await getActiveTreeOrFail();

    const result = await renameTree(tree.slug, {
      newName,
      newSlug: options.slug,
    });

    const nameChanged = result.oldName !== result.newName;
    const slugChanged = result.oldSlug !== result.newSlug;

    if (!nameChanged && !slugChanged) {
      console.log(`Nothing to change for tree "${result.oldName}".`);
      return;
    }

    if (nameChanged) {
      console.log(`Renamed: "${result.oldName}" → "${result.newName}"`);
    }
    if (slugChanged) {
      console.log(`Slug:    ${result.oldSlug} → ${result.newSlug}`);
    }
    for (const move of result.movedWorktrees) {
      console.log(`  Worktree moved:  ${move.from} → ${move.to}`);
    }
    for (const br of result.renamedBranches) {
      console.log(`  Branch renamed:  ${br.from} → ${br.to}`);
    }

    if (slugChanged) {
      console.log('');
      console.log(
        'Note: existing Claude Code conversations keep their original session names,',
      );
      console.log('so `cctree resume` still works for previously created children.');
    }
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
    process.exit(1);
  }
}
