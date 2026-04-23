import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

const { TEST_DIR } = vi.hoisted(() => {
  const path = require('node:path');
  const os = require('node:os');
  const TEST_DIR = path.join(
    os.tmpdir(),
    `cctree-export-mermaid-tool-${Date.now()}-${Math.random().toString(36).slice(2)}`,
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

import { createTree, addChild } from '../../src/lib/storage.js';
import { exportMermaidTool } from '../../src/tools/export-mermaid.js';

beforeEach(async () => {
  await mkdir(TEST_DIR, { recursive: true });
});

afterEach(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
});

describe('exportMermaidTool', () => {
  it('returns the all-trees diagram when no tree filter is given', async () => {
    await createTree('Auth', TEST_DIR, []);
    await createTree('Payments', TEST_DIR, []);

    const diagram = await exportMermaidTool({});
    expect(diagram).toContain('graph TD');
    expect(diagram).toContain('<b>Auth</b>');
    expect(diagram).toContain('<b>Payments</b>');
  });

  it('filters to a single tree when tree arg is given', async () => {
    await createTree('Auth', TEST_DIR, []);
    await createTree('Payments', TEST_DIR, []);
    await addChild('auth', {
      name: 'Research',
      slug: 'research',
      status: 'active',
      claude_session_name: 'Auth > Research',
      created_at: '2026-04-15T10:00:00Z',
    });

    const diagram = await exportMermaidTool({ tree: 'auth' });
    expect(diagram).toContain('<b>Auth</b>');
    expect(diagram).toContain('Research');
    expect(diagram).not.toContain('<b>Payments</b>');
  });

  it('resolves tree by display name case-insensitively', async () => {
    await createTree('Auth Service v2', TEST_DIR, []);
    const diagram = await exportMermaidTool({ tree: 'AUTH SERVICE V2' });
    expect(diagram).toContain('<b>Auth Service v2</b>');
  });

  it('returns the empty-state diagram when there are no trees', async () => {
    const diagram = await exportMermaidTool({});
    expect(diagram).toContain('graph TD');
    expect(diagram).toContain('No trees yet');
  });

  it('throws a helpful error when the requested tree does not exist', async () => {
    await createTree('Auth', TEST_DIR, []);
    await expect(exportMermaidTool({ tree: 'does-not-exist' })).rejects.toThrow();
  });
});
