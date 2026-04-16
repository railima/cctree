import { spawn } from 'node:child_process';
import { toSlug } from '../utils/slug.js';
import { rebuildContext } from '../lib/context-builder.js';
import {
  getActiveTreeOrFail,
  addChild,
  writeActiveSession,
} from '../lib/storage.js';
import { injectContextPath } from '../lib/config.js';
import { writeFile } from 'node:fs/promises';
import type { ChildSession } from '../types/index.js';

export async function branchCommand(
  name: string,
  options: { open: boolean },
): Promise<void> {
  try {
    const tree = await getActiveTreeOrFail();
    const slug = toSlug(name);
    const sessionName = `${tree.name} > ${name}`;

    const child: ChildSession = {
      name,
      slug,
      status: 'active',
      claude_session_name: sessionName,
      created_at: new Date().toISOString(),
    };

    await addChild(tree.slug, child);

    const contextContent = await rebuildContext(tree.slug);
    const injectPath = injectContextPath(tree.slug);
    await writeFile(injectPath, contextContent);

    await writeActiveSession({ tree: tree.slug, child: slug });

    console.log(`Session "${name}" created in tree "${tree.name}".`);

    if (!options.open) {
      console.log('Use "cctree resume <name>" to open it later.');
      return;
    }

    console.log(`Opening Claude Code as "${sessionName}"...`);
    console.log('');

    const args = [
      '--name', sessionName,
      '--append-system-prompt-file', injectPath,
      `You are working on: ${name} (part of ${tree.name}). Use the cctree MCP tools (commit_to_parent, get_tree_status, get_sibling_context) to interact with the session tree.`,
    ];

    const child_process = spawn('claude', args, {
      stdio: 'inherit',
      env: {
        ...process.env,
        CCTREE_TREE: tree.slug,
        CCTREE_CHILD: slug,
      },
    });

    child_process.on('error', (err) => {
      console.error(`Failed to launch Claude Code: ${err.message}`);
      console.error('Make sure "claude" is available in your PATH.');
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
