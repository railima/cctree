import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, rm, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  isGitRepo,
  revParseHead,
  branchExists,
  createWorktree,
  removeWorktree,
} from '../../src/lib/git.js';

const run = promisify(execFile);

let repoDir: string;

async function initRepo(): Promise<string> {
  const dir = join(tmpdir(), `cctree-git-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(dir, { recursive: true });
  await run('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  await run('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
  await run('git', ['config', 'user.name', 'Test'], { cwd: dir });
  await run('git', ['config', 'commit.gpgsign', 'false'], { cwd: dir });
  await writeFile(join(dir, 'README.md'), '# test\n');
  await run('git', ['add', '.'], { cwd: dir });
  await run('git', ['commit', '-q', '-m', 'init'], { cwd: dir });
  return dir;
}

beforeEach(async () => {
  repoDir = await initRepo();
});

afterEach(async () => {
  await rm(repoDir, { recursive: true, force: true });
});

describe('isGitRepo', () => {
  it('returns true for a git repo', async () => {
    expect(await isGitRepo(repoDir)).toBe(true);
  });

  it('returns false for a non-repo directory', async () => {
    const nonRepo = join(tmpdir(), `cctree-nonrepo-${Date.now()}`);
    await mkdir(nonRepo, { recursive: true });
    try {
      expect(await isGitRepo(nonRepo)).toBe(false);
    } finally {
      await rm(nonRepo, { recursive: true, force: true });
    }
  });

  it('returns false when the path does not exist', async () => {
    expect(await isGitRepo('/nonexistent-path-for-cctree-test')).toBe(false);
  });
});

describe('revParseHead', () => {
  it('returns the current HEAD sha', async () => {
    const sha = await revParseHead(repoDir);
    expect(sha).toMatch(/^[0-9a-f]{40}$/);
  });
});

describe('branchExists', () => {
  it('returns true for the default branch', async () => {
    expect(await branchExists(repoDir, 'main')).toBe(true);
  });

  it('returns false for a non-existent branch', async () => {
    expect(await branchExists(repoDir, 'nope/does-not-exist')).toBe(false);
  });
});

describe('createWorktree', () => {
  it('creates a worktree on a new branch', async () => {
    const wtPath = join(repoDir, '..', `wt-${Date.now()}`);
    try {
      await createWorktree({
        repoCwd: repoDir,
        path: wtPath,
        branch: 'cctree/test-tree/first-child',
      });

      const s = await stat(wtPath);
      expect(s.isDirectory()).toBe(true);
      expect(await branchExists(repoDir, 'cctree/test-tree/first-child')).toBe(true);

      const { stdout } = await run('git', ['-C', wtPath, 'rev-parse', '--abbrev-ref', 'HEAD']);
      expect(stdout.trim()).toBe('cctree/test-tree/first-child');
    } finally {
      await rm(wtPath, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('checks out an existing branch into a worktree', async () => {
    await run('git', ['-C', repoDir, 'branch', 'existing-branch']);

    const wtPath = join(repoDir, '..', `wt-existing-${Date.now()}`);
    try {
      await createWorktree({
        repoCwd: repoDir,
        path: wtPath,
        branch: 'existing-branch',
      });

      const { stdout } = await run('git', ['-C', wtPath, 'rev-parse', '--abbrev-ref', 'HEAD']);
      expect(stdout.trim()).toBe('existing-branch');
    } finally {
      await rm(wtPath, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('throws a descriptive error when the path is already occupied', async () => {
    const wtPath = join(repoDir, '..', `wt-dup-${Date.now()}`);
    try {
      await createWorktree({
        repoCwd: repoDir,
        path: wtPath,
        branch: 'cctree/dup/first',
      });

      await expect(
        createWorktree({
          repoCwd: repoDir,
          path: wtPath,
          branch: 'cctree/dup/second',
        }),
      ).rejects.toThrow(/git worktree add/);
    } finally {
      await rm(wtPath, { recursive: true, force: true }).catch(() => {});
    }
  });
});

describe('removeWorktree', () => {
  it('removes a worktree', async () => {
    const wtPath = join(repoDir, '..', `wt-remove-${Date.now()}`);
    try {
      await createWorktree({
        repoCwd: repoDir,
        path: wtPath,
        branch: 'cctree/remove/one',
      });

      await removeWorktree(repoDir, wtPath);

      await expect(stat(wtPath)).rejects.toThrow();
    } finally {
      await rm(wtPath, { recursive: true, force: true }).catch(() => {});
    }
  });
});
