import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

const { TEST_DIR } = vi.hoisted(() => {
  const path = require('node:path');
  const os = require('node:os');
  const TEST_DIR = path.join(
    os.tmpdir(),
    `cctree-find-${Date.now()}-${Math.random().toString(36).slice(2)}`,
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

import {
  createTree,
  addChild,
  saveChildSummary,
  updateChildStatus,
  setChildTags,
} from '../../src/lib/storage.js';
import { findInTrees, formatFindMatches } from '../../src/lib/find.js';

beforeEach(async () => {
  await mkdir(TEST_DIR, { recursive: true });
});

afterEach(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
});

async function seedFixture() {
  await createTree('Sprint 2', TEST_DIR, []);
  await addChild('sprint-2', {
    name: 'TICKET-1234 auth bug',
    slug: 'ticket-1234',
    status: 'active',
    claude_session_name: 'Sprint 2 > TICKET-1234',
    created_at: '2026-04-01T10:00:00Z',
  });
  await setChildTags('sprint-2', 'ticket-1234', ['ticket-1234', 'bug']);
  await saveChildSummary(
    'sprint-2',
    'ticket-1234',
    [
      '## TL;DR',
      'Investigated and patched OAuth refresh race condition.',
      '',
      '## Decisions',
      '- Use a mutex around token refresh',
      '',
      '## Artifacts',
      '- src/auth/refresh.ts',
    ].join('\n'),
  );
  await updateChildStatus(
    'sprint-2',
    'ticket-1234',
    'committed',
    '2026-04-02T10:00:00Z',
  );

  await createTree('MCP Release', TEST_DIR, []);
  await addChild('mcp-release', {
    name: 'Transport research',
    slug: 'transport-research',
    status: 'active',
    claude_session_name: 'MCP Release > Transport research',
    created_at: '2026-04-03T10:00:00Z',
  });
  await setChildTags('mcp-release', 'transport-research', ['research']);
  await saveChildSummary(
    'mcp-release',
    'transport-research',
    [
      '## TL;DR',
      'Compared stdio vs SSE for MCP server transport.',
      '',
      '## Decisions',
      '- Use stdio transport',
    ].join('\n'),
  );
  await updateChildStatus(
    'mcp-release',
    'transport-research',
    'committed',
    '2026-04-04T10:00:00Z',
  );
}

describe('findInTrees', () => {
  it('returns [] for empty query', async () => {
    await seedFixture();
    expect(await findInTrees('   ')).toEqual([]);
  });

  it('matches tree names case-insensitively', async () => {
    await seedFixture();
    const matches = await findInTrees('SPRINT');
    expect(matches.some((m) => m.field === 'tree-name')).toBe(true);
  });

  it('matches child names', async () => {
    await seedFixture();
    const matches = await findInTrees('auth bug');
    expect(matches.some((m) => m.field === 'child-name')).toBe(true);
  });

  it('matches tags', async () => {
    await seedFixture();
    const matches = await findInTrees('ticket-1234');
    expect(matches.some((m) => m.field === 'tag')).toBe(true);
  });

  it('matches words inside TL;DR of committed sessions', async () => {
    await seedFixture();
    const matches = await findInTrees('OAuth refresh');
    const tldrMatches = matches.filter((m) => m.field === 'tldr');
    expect(tldrMatches).toHaveLength(1);
    expect(tldrMatches[0].child?.slug).toBe('ticket-1234');
  });

  it('matches decisions', async () => {
    await seedFixture();
    const matches = await findInTrees('mutex');
    expect(matches.some((m) => m.field === 'decision')).toBe(true);
  });

  it('matches artifacts', async () => {
    await seedFixture();
    const matches = await findInTrees('refresh.ts');
    expect(matches.some((m) => m.field === 'artifact')).toBe(true);
  });

  it('does NOT search summaries of non-committed sessions', async () => {
    await createTree('Live', TEST_DIR, []);
    await addChild('live', {
      name: 'Active session',
      slug: 'active-session',
      status: 'active',
      claude_session_name: 'Live > Active',
      created_at: '2026-04-01T10:00:00Z',
    });
    // Save summary but DO NOT commit.
    await saveChildSummary(
      'live',
      'active-session',
      '## TL;DR\nuncommitted-secret-token',
    );

    const matches = await findInTrees('uncommitted-secret-token');
    expect(matches).toHaveLength(0);
  });

  it('returns multiple hits across trees', async () => {
    await seedFixture();
    const matches = await findInTrees('use');
    const trees = new Set(matches.map((m) => m.tree.slug));
    expect(trees.has('sprint-2')).toBe(true);
    expect(trees.has('mcp-release')).toBe(true);
  });
});

describe('formatFindMatches', () => {
  it('says no matches when empty', () => {
    const out = formatFindMatches([], 'foo');
    expect(out).toContain('No matches');
  });

  it('groups matches by tree and prints field + child', async () => {
    await seedFixture();
    const matches = await findInTrees('mutex');
    const out = formatFindMatches(matches, 'mutex');
    expect(out).toContain('Sprint 2');
    expect(out).toContain('decision > TICKET-1234 auth bug:');
    expect(out).toContain('1 match.');
  });
});
