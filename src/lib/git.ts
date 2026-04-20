import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

export interface GitError extends Error {
  stderr?: string;
  code?: number;
}

async function git(cwd: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await run('git', args, { cwd, maxBuffer: 10 * 1024 * 1024 });
    return stdout.trim();
  } catch (err) {
    const e = err as { stderr?: string; code?: number; message: string };
    const wrapped = new Error(
      `git ${args.join(' ')} failed${e.stderr ? `: ${e.stderr.trim()}` : `: ${e.message}`}`,
    ) as GitError;
    wrapped.stderr = e.stderr;
    wrapped.code = e.code;
    throw wrapped;
  }
}

export async function isGitRepo(cwd: string): Promise<boolean> {
  try {
    await git(cwd, ['rev-parse', '--git-dir']);
    return true;
  } catch {
    return false;
  }
}

export async function revParseHead(cwd: string): Promise<string> {
  return git(cwd, ['rev-parse', 'HEAD']);
}

export async function branchExists(cwd: string, branch: string): Promise<boolean> {
  try {
    await git(cwd, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`]);
    return true;
  } catch {
    return false;
  }
}

export interface CreateWorktreeOptions {
  repoCwd: string;
  path: string;
  branch: string;
  baseRef?: string;
}

export async function createWorktree(opts: CreateWorktreeOptions): Promise<void> {
  const { repoCwd, path, branch, baseRef } = opts;
  const exists = await branchExists(repoCwd, branch);
  if (exists) {
    await git(repoCwd, ['worktree', 'add', path, branch]);
  } else {
    const args = ['worktree', 'add', '-b', branch, path];
    if (baseRef) args.push(baseRef);
    await git(repoCwd, args);
  }
}

export async function removeWorktree(repoCwd: string, path: string): Promise<void> {
  await git(repoCwd, ['worktree', 'remove', path]);
}

export async function deleteBranch(repoCwd: string, branch: string): Promise<void> {
  await git(repoCwd, ['branch', '-D', branch]);
}

export async function renameBranch(
  repoCwd: string,
  oldName: string,
  newName: string,
): Promise<void> {
  await git(repoCwd, ['branch', '-m', oldName, newName]);
}

export async function repairWorktree(repoCwd: string, path: string): Promise<void> {
  await git(repoCwd, ['worktree', 'repair', path]);
}
