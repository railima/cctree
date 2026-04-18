import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { toSlug } from '../utils/slug.js';
import { rebuildContext } from '../lib/context-builder.js';
import {
  getActiveTreeOrFail,
  addChild,
  writeActiveSession,
} from '../lib/storage.js';
import { injectContextPath, worktreePath } from '../lib/config.js';
import {
  createWorktree,
  isGitRepo,
  revParseHead,
} from '../lib/git.js';
import type { ChildSession, WorktreeInfo } from '../types/index.js';

export interface BranchOptions {
  open: boolean;
  worktree?: string | boolean;
}

async function setupWorktree(
  treeCwd: string,
  treeSlug: string,
  childSlug: string,
  branchOverride?: string,
): Promise<WorktreeInfo> {
  if (!(await isGitRepo(treeCwd))) {
    throw new Error(
      `Cannot create worktree: "${treeCwd}" is not a git repository. Run \`git init\` in the tree's working directory first.`,
    );
  }

  const branch = branchOverride ?? `cctree/${treeSlug}/${childSlug}`;
  const path = worktreePath(treeSlug, childSlug);
  const baseRef = await revParseHead(treeCwd);

  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await createWorktree({ repoCwd: treeCwd, path, branch, baseRef });

  return { path, branch, base_ref: baseRef };
}

export async function branchCommand(
  name: string,
  options: BranchOptions,
): Promise<void> {
  try {
    const tree = await getActiveTreeOrFail();
    const slug = toSlug(name);
    const sessionName = `${tree.name} > ${name}`;

    let worktree: WorktreeInfo | undefined;
    if (options.worktree) {
      const branchOverride =
        typeof options.worktree === 'string' ? options.worktree : undefined;
      worktree = await setupWorktree(tree.cwd, tree.slug, slug, branchOverride);
    }

    const child: ChildSession = {
      name,
      slug,
      status: 'active',
      claude_session_name: sessionName,
      created_at: new Date().toISOString(),
      ...(worktree ? { worktree } : {}),
    };

    await addChild(tree.slug, child);

    const contextContent = await rebuildContext(tree.slug);
    const injectPath = injectContextPath(tree.slug);
    await writeFile(injectPath, contextContent);

    await writeActiveSession({ tree: tree.slug, child: slug });

    console.log(`Session "${name}" created in tree "${tree.name}".`);
    if (worktree) {
      console.log(`  Worktree: ${worktree.path}`);
      console.log(`  Branch:   ${worktree.branch}`);
    }

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
      cwd: worktree?.path ?? tree.cwd,
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
