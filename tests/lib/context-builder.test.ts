import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

const { TEST_DIR } = vi.hoisted(() => {
  const path = require('node:path');
  const os = require('node:os');
  const TEST_DIR = path.join(os.tmpdir(), `cctree-ctx-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
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
  CONTEXT_HOOK_MAX_CHARS: 100,
}));

import { createTree, addChild, updateChildStatus, saveChildSummary } from '../../src/lib/storage.js';
import { rebuildContext, truncateForHook } from '../../src/lib/context-builder.js';
import { writeFile } from 'node:fs/promises';

beforeEach(async () => {
  await mkdir(TEST_DIR, { recursive: true });
});

afterEach(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
});

describe('rebuildContext', () => {
  it('builds context from initial files only', async () => {
    const fixtureDir = join(TEST_DIR, 'fixtures');
    await mkdir(fixtureDir, { recursive: true });
    await writeFile(join(fixtureDir, 'spec.md'), 'This is the spec');

    await createTree('Test', fixtureDir, ['spec.md']);

    const content = await rebuildContext('test');
    expect(content).toContain('# Context: Test');
    expect(content).toContain('## Initial Context');
    expect(content).toContain('### spec.md');
    expect(content).toContain('This is the spec');
  });

  it('includes committed children summaries in order', async () => {
    await createTree('Multi', TEST_DIR, []);

    await addChild('multi', {
      name: 'First',
      slug: 'first',
      status: 'active',
      claude_session_name: 'Multi > First',
      created_at: '2026-04-16T10:00:00Z',
    });

    await addChild('multi', {
      name: 'Second',
      slug: 'second',
      status: 'active',
      claude_session_name: 'Multi > Second',
      created_at: '2026-04-16T11:00:00Z',
    });

    await saveChildSummary('multi', 'first', '## Decisions\n- Decision A');
    await updateChildStatus('multi', 'first', 'committed', '2026-04-16T12:00:00Z');

    await saveChildSummary('multi', 'second', '## Decisions\n- Decision B');
    await updateChildStatus('multi', 'second', 'committed', '2026-04-16T13:00:00Z');

    const content = await rebuildContext('multi');

    expect(content).toContain('## Session: First');
    expect(content).toContain('Decision A');
    expect(content).toContain('## Session: Second');
    expect(content).toContain('Decision B');

    const firstIdx = content.indexOf('Session: First');
    const secondIdx = content.indexOf('Session: Second');
    expect(firstIdx).toBeLessThan(secondIdx);
  });

  it('excludes active and abandoned children', async () => {
    await createTree('Filter', TEST_DIR, []);

    await addChild('filter', {
      name: 'Active One',
      slug: 'active-one',
      status: 'active',
      claude_session_name: 'Filter > Active One',
      created_at: '2026-04-16T10:00:00Z',
    });

    await addChild('filter', {
      name: 'Abandoned',
      slug: 'abandoned',
      status: 'active',
      claude_session_name: 'Filter > Abandoned',
      created_at: '2026-04-16T11:00:00Z',
    });
    await updateChildStatus('filter', 'abandoned', 'abandoned');

    const content = await rebuildContext('filter');

    expect(content).not.toContain('Active One');
    expect(content).not.toContain('Abandoned');
  });
});

describe('truncateForHook', () => {
  it('returns content unchanged if under limit', () => {
    const short = 'hello world';
    expect(truncateForHook(short, 100)).toBe(short);
  });

  it('truncates and adds suffix when over limit', () => {
    const long = 'x'.repeat(200);
    const result = truncateForHook(long, 100);
    expect(result.length).toBeLessThanOrEqual(100);
    expect(result).toContain('[truncated');
  });
});
