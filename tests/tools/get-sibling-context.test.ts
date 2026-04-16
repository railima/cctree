import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

const { TEST_DIR } = vi.hoisted(() => {
  const path = require('node:path');
  const os = require('node:os');
  const TEST_DIR = path.join(os.tmpdir(), `cctree-sibling-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
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

import {
  createTree,
  addChild,
  updateChildStatus,
  saveChildSummary,
  writeActiveSession,
} from '../../src/lib/storage.js';
import { getSiblingContext } from '../../src/tools/get-sibling-context.js';

beforeEach(async () => {
  await mkdir(TEST_DIR, { recursive: true });
});

afterEach(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
});

describe('getSiblingContext', () => {
  it('reads a committed sibling summary', async () => {
    await createTree('Release', TEST_DIR, []);
    await addChild('release', {
      name: 'Architecture',
      slug: 'architecture',
      status: 'active',
      claude_session_name: 'Release > Architecture',
      created_at: '2026-04-16T10:00:00Z',
    });
    await addChild('release', {
      name: 'Implementation',
      slug: 'implementation',
      status: 'active',
      claude_session_name: 'Release > Implementation',
      created_at: '2026-04-16T11:00:00Z',
    });

    await saveChildSummary('release', 'architecture', '## Decisions\n- Microservices');
    await updateChildStatus('release', 'architecture', 'committed', '2026-04-16T12:00:00Z');

    await writeActiveSession({ tree: 'release', child: 'implementation' });

    const ctx = await getSiblingContext('architecture');
    expect(ctx.name).toBe('Architecture');
    expect(ctx.status).toBe('committed');
    expect(ctx.summary).toContain('Microservices');
  });

  it('finds by name case-insensitively', async () => {
    await createTree('Release', TEST_DIR, []);
    await addChild('release', {
      name: 'My Research',
      slug: 'my-research',
      status: 'active',
      claude_session_name: 'Release > My Research',
      created_at: '2026-04-16T10:00:00Z',
    });
    await saveChildSummary('release', 'my-research', 'content');
    await updateChildStatus('release', 'my-research', 'committed', '2026-04-16T12:00:00Z');

    await addChild('release', {
      name: 'Current',
      slug: 'current',
      status: 'active',
      claude_session_name: 'Release > Current',
      created_at: '2026-04-16T13:00:00Z',
    });
    await writeActiveSession({ tree: 'release', child: 'current' });

    const ctx = await getSiblingContext('MY RESEARCH');
    expect(ctx.slug).toBe('my-research');
  });

  it('throws for uncommitted sibling', async () => {
    await createTree('Release', TEST_DIR, []);
    await addChild('release', {
      name: 'WIP',
      slug: 'wip',
      status: 'active',
      claude_session_name: 'Release > WIP',
      created_at: new Date().toISOString(),
    });
    await addChild('release', {
      name: 'Current',
      slug: 'current',
      status: 'active',
      claude_session_name: 'Release > Current',
      created_at: new Date().toISOString(),
    });
    await writeActiveSession({ tree: 'release', child: 'current' });

    await expect(getSiblingContext('wip')).rejects.toThrow('not been committed');
  });

  it('throws for nonexistent sibling', async () => {
    await createTree('Release', TEST_DIR, []);
    await addChild('release', {
      name: 'Current',
      slug: 'current',
      status: 'active',
      claude_session_name: 'Release > Current',
      created_at: new Date().toISOString(),
    });
    await writeActiveSession({ tree: 'release', child: 'current' });

    await expect(getSiblingContext('nope')).rejects.toThrow('not found');
  });

  it('throws when no active session', async () => {
    await expect(getSiblingContext('anything')).rejects.toThrow('Not inside a cctree session');
  });
});
