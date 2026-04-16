import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

const { TEST_DIR } = vi.hoisted(() => {
  const path = require('node:path');
  const os = require('node:os');
  const TEST_DIR = path.join(os.tmpdir(), `cctree-status-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
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
  CONTEXT_HOOK_MAX_CHARS: 9500,
}));

import { createTree, addChild, writeActiveSession } from '../../src/lib/storage.js';
import { getTreeStatus } from '../../src/tools/get-tree-status.js';

beforeEach(async () => {
  await mkdir(TEST_DIR, { recursive: true });
});

afterEach(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
});

describe('getTreeStatus', () => {
  it('returns tree info with children', async () => {
    await createTree('My Release', TEST_DIR, []);
    await addChild('my-release', {
      name: 'Research',
      slug: 'research',
      status: 'active',
      claude_session_name: 'My Release > Research',
      created_at: '2026-04-16T10:00:00Z',
    });
    await addChild('my-release', {
      name: 'Implementation',
      slug: 'implementation',
      status: 'committed',
      claude_session_name: 'My Release > Implementation',
      created_at: '2026-04-16T11:00:00Z',
      committed_at: '2026-04-16T14:00:00Z',
    });
    await writeActiveSession({ tree: 'my-release', child: 'research' });

    const status = await getTreeStatus();

    expect(status.name).toBe('My Release');
    expect(status.slug).toBe('my-release');
    expect(status.activeChild).toBe('research');
    expect(status.children).toHaveLength(2);
    expect(status.children[0].name).toBe('Research');
    expect(status.children[0].status).toBe('active');
    expect(status.children[1].name).toBe('Implementation');
    expect(status.children[1].status).toBe('committed');
    expect(status.display).toContain('My Release');
  });

  it('throws when no active session', async () => {
    await expect(getTreeStatus()).rejects.toThrow('Not inside a cctree session');
  });
});
