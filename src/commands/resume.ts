import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import {
  getActiveTreeOrFail,
  findChildByNameOrSlug,
  writeActiveSession,
} from '../lib/storage.js';
import { rebuildContext } from '../lib/context-builder.js';
import { injectContextPath } from '../lib/config.js';

export async function resumeCommand(name: string): Promise<void> {
  try {
    const tree = await getActiveTreeOrFail();
    const child = await findChildByNameOrSlug(tree, name);

    if (!child) {
      console.error(`Session "${name}" not found in tree "${tree.name}".`);
      console.error('Available sessions:');
      for (const c of tree.children) {
        console.error(`  - ${c.name} (${c.slug}) [${c.status}]`);
      }
      process.exit(1);
    }

    const contextContent = await rebuildContext(tree.slug);
    const injectPath = injectContextPath(tree.slug);
    await writeFile(injectPath, contextContent);

    await writeActiveSession({ tree: tree.slug, child: child.slug });

    console.log(`Resuming "${child.claude_session_name}"...`);
    if (child.worktree) {
      console.log(`  Worktree: ${child.worktree.path}`);
    }
    console.log('');

    const args = ['--resume', child.claude_session_name];

    const child_process = spawn('claude', args, {
      stdio: 'inherit',
      cwd: child.worktree?.path ?? tree.cwd,
      env: {
        ...process.env,
        CCTREE_TREE: tree.slug,
        CCTREE_CHILD: child.slug,
      },
    });

    child_process.on('error', (err) => {
      console.error(`Failed to launch Claude Code: ${err.message}`);
      process.exit(1);
    });

    child_process.on('exit', (code) => {
      process.exit(code ?? 0);
    });
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
    process.exit(1);
  }
}
