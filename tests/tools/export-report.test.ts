import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

const { TEST_DIR } = vi.hoisted(() => {
  const path = require('node:path');
  const os = require('node:os');
  const TEST_DIR = path.join(
    os.tmpdir(),
    `cctree-export-report-tool-${Date.now()}-${Math.random().toString(36).slice(2)}`,
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
  addChild,
  createTree,
  saveChildSummary,
} from '../../src/lib/storage.js';
import { exportReportTool } from '../../src/tools/export-report.js';

beforeEach(async () => {
  await mkdir(TEST_DIR, { recursive: true });
});

afterEach(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
});

async function seedTree(): Promise<void> {
  await createTree('Auth Service v2', TEST_DIR, []);
  await addChild('auth-service-v2', {
    name: 'Research',
    slug: 'research',
    status: 'committed',
    claude_session_name: 'Auth Service v2 > Research',
    created_at: '2026-04-14T10:00:00Z',
    committed_at: '2026-04-15T18:00:00Z',
  });
  await saveChildSummary(
    'auth-service-v2',
    'research',
    `## Decisions
- Chose microservices

## Artifacts Created
- src/auth.ts

## Open Questions
- Schema versioning?`,
  );

  await addChild('auth-service-v2', {
    name: 'Impl',
    slug: 'impl',
    status: 'committed',
    claude_session_name: 'Auth Service v2 > Impl',
    created_at: '2026-04-16T10:00:00Z',
    committed_at: '2026-04-17T18:00:00Z',
  });
  await saveChildSummary(
    'auth-service-v2',
    'impl',
    `## Decisions
- Use JWT with refresh

## Artifacts Created
- src/auth.ts
- src/middleware/token.ts`,
  );

  await addChild('auth-service-v2', {
    name: 'API Design',
    slug: 'api-design',
    status: 'active',
    claude_session_name: 'Auth Service v2 > API Design',
    created_at: '2026-04-18T10:00:00Z',
  });
}

describe('exportReportTool', () => {
  it('aggregates every section across all children by default', async () => {
    await seedTree();
    const md = await exportReportTool({ tree: 'auth-service-v2', author: 'Rai' });

    expect(md).toContain('# Auth Service v2 — progress report');
    expect(md).toContain('**Author**: Rai');
    expect(md).toContain('**Scope**: all sessions');
    expect(md).toContain('2 delivered · 1 in progress');

    expect(md).toContain('## Decisions');
    expect(md).toContain('Chose microservices');
    expect(md).toContain('Use JWT with refresh');

    expect(md).toContain('## Open questions');
    expect(md).toContain('Schema versioning?');

    expect(md).toContain('## Artifacts delivered');
    expect(md).toContain('src/middleware/token.ts');

    // hot files: src/auth.ts mentioned by 2 sessions, src/middleware/token.ts by 1
    const hot = md.slice(md.indexOf('## Hot files'));
    expect(hot).toMatch(/src\/auth\.ts`.*\|\s*2 —/);
    expect(hot).toMatch(/src\/middleware\/token\.ts`.*\|\s*1 —/);
    expect(hot.indexOf('src/auth.ts')).toBeLessThan(hot.indexOf('src/middleware/token.ts'));

    expect(md).toContain('```mermaid\ngantt');
    expect(md).toContain('```mermaid\ngraph TD');
  });

  it('restricts the report to the requested children', async () => {
    await seedTree();
    const md = await exportReportTool({
      tree: 'auth-service-v2',
      children: ['research'],
      author: 'Rai',
    });

    expect(md).toContain('**Scope**: 1 of 3 sessions');
    expect(md).toContain('Chose microservices');
    expect(md).not.toContain('Use JWT with refresh');
  });

  it('resolves the tree by display name case-insensitively', async () => {
    await seedTree();
    const md = await exportReportTool({ tree: 'AUTH SERVICE V2', author: 'Rai' });
    expect(md).toContain('# Auth Service v2 — progress report');
  });

  it('throws when the tree does not exist', async () => {
    await expect(exportReportTool({ tree: 'nope' })).rejects.toThrow();
  });

  it('throws listing the missing child slugs when a filter misses', async () => {
    await seedTree();
    await expect(
      exportReportTool({
        tree: 'auth-service-v2',
        children: ['research', 'does-not-exist'],
      }),
    ).rejects.toThrow(/not found in tree.*does-not-exist/);
  });
});
