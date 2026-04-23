import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdir, readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';

const { TEST_DIR } = vi.hoisted(() => {
  const path = require('node:path');
  const os = require('node:os');
  const TEST_DIR = path.join(
    os.tmpdir(),
    `cctree-export-obsidian-tool-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  return { TEST_DIR };
});

vi.mock('../../src/lib/config.js', () => ({
  paths: {
    base: TEST_DIR,
    trees: join(TEST_DIR, 'trees'),
    activeTree: join(TEST_DIR, 'active-tree'),
    activeSession: join(TEST_DIR, 'active-session.json'),
  },
  treePath: (slug: string) => join(TEST_DIR, 'trees', slug),
  treeJsonPath: (slug: string) => join(TEST_DIR, 'trees', slug, 'tree.json'),
  contextPath: (slug: string) => join(TEST_DIR, 'trees', slug, 'context.md'),
  initialContextDir: (slug: string) => join(TEST_DIR, 'trees', slug, 'initial-context'),
  childrenDir: (slug: string) => join(TEST_DIR, 'trees', slug, 'children'),
  childSummaryPath: (treeSlug: string, childSlug: string) =>
    join(TEST_DIR, 'trees', treeSlug, 'children', `${childSlug}.md`),
  injectContextPath: (slug: string) => join(TEST_DIR, 'trees', slug, '.inject-context.md'),
  worktreesDir: (slug: string) => join(TEST_DIR, 'trees', slug, 'worktrees'),
  worktreePath: (treeSlug: string, childSlug: string) =>
    join(TEST_DIR, 'trees', treeSlug, 'worktrees', childSlug),
  CONTEXT_HOOK_MAX_CHARS: 9500,
}));

import { createTree, addChild, saveChildSummary } from '../../src/lib/storage.js';
import { exportObsidianTool } from '../../src/tools/export-obsidian.js';

beforeEach(async () => {
  await mkdir(TEST_DIR, { recursive: true });
});

afterEach(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
});

async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

describe('exportObsidianTool', () => {
  it('writes the full vault layout and reports counts', async () => {
    const vault = join(TEST_DIR, 'vault');
    await mkdir(vault, { recursive: true });

    await createTree('Auth', TEST_DIR, []);
    await addChild('auth', {
      name: 'Research',
      slug: 'research',
      status: 'committed',
      claude_session_name: 'Auth > Research',
      created_at: '2026-04-14T10:00:00Z',
      committed_at: '2026-04-15T18:00:00Z',
    });
    await saveChildSummary('auth', 'research', '## Decisions\n- Use JWT.\n\n## Artifacts\n- src/auth.ts');

    const result = await exportObsidianTool({ vaultPath: vault });

    expect(result.treesWritten).toBe(1);
    expect(result.childrenWritten).toBe(1);
    expect(result.focusedTree).toBeNull();
    expect(result.cctreeDir).toBe(join(vault, 'cctree'));

    expect(await pathExists(join(vault, 'cctree', 'index.md'))).toBe(true);
    expect(await pathExists(join(vault, 'cctree', 'auth', '_index.md'))).toBe(true);
    expect(await pathExists(join(vault, 'cctree', 'auth', 'research.md'))).toBe(true);

    const childContent = await readFile(
      join(vault, 'cctree', 'auth', 'research.md'),
      'utf-8',
    );
    expect(childContent).toContain('[[file:src/auth.ts]]');
  });

  it('with tree focus, rewrites only that tree and leaves index.md alone', async () => {
    const vault = join(TEST_DIR, 'vault');
    await mkdir(join(vault, 'cctree'), { recursive: true });
    // Pre-seed a MOC file that must not be overwritten
    await mkdir(join(vault, 'cctree'), { recursive: true });
    const { writeFile } = await import('node:fs/promises');
    await writeFile(join(vault, 'cctree', 'index.md'), '# pre-existing MOC');

    await createTree('Alpha', TEST_DIR, []);
    await createTree('Beta', TEST_DIR, []);

    const result = await exportObsidianTool({ vaultPath: vault, tree: 'alpha' });

    expect(result.focusedTree).toBe('Alpha');
    expect(result.treesWritten).toBe(1);

    expect(await pathExists(join(vault, 'cctree', 'alpha', '_index.md'))).toBe(true);
    expect(await pathExists(join(vault, 'cctree', 'beta'))).toBe(false);

    const indexContent = await readFile(join(vault, 'cctree', 'index.md'), 'utf-8');
    expect(indexContent).toBe('# pre-existing MOC');
  });

  it('propagates the "vault does not exist" error', async () => {
    await expect(
      exportObsidianTool({ vaultPath: '/definitely-not-a-real-dir-xyz' }),
    ).rejects.toThrow(/does not exist/);
  });

  it('throws when the requested focus tree does not exist', async () => {
    const vault = join(TEST_DIR, 'vault');
    await mkdir(vault, { recursive: true });
    await expect(
      exportObsidianTool({ vaultPath: vault, tree: 'ghost' }),
    ).rejects.toThrow();
  });
});
