import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdir, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const { TEST_DIR } = vi.hoisted(() => {
  const path = require('node:path');
  const os = require('node:os');
  const TEST_DIR = path.join(os.tmpdir(), `cctree-commit-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
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

import { createTree, addChild, loadTree, writeActiveSession } from '../../src/lib/storage.js';
import { commitToParent } from '../../src/tools/commit-to-parent.js';

beforeEach(async () => {
  await mkdir(TEST_DIR, { recursive: true });
});

afterEach(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
});

describe('commitToParent', () => {
  it('commits summary and updates child status', async () => {
    await createTree('Release', TEST_DIR, []);
    await addChild('release', {
      name: 'Research',
      slug: 'research',
      status: 'active',
      claude_session_name: 'Release > Research',
      created_at: new Date().toISOString(),
    });
    await writeActiveSession({ tree: 'release', child: 'research' });

    const summary = '## Decisions\n- Use TypeScript\n\n## Next Steps\n- Implement Phase 2';
    const result = await commitToParent(summary);

    expect(result.tree).toBe('Release');
    expect(result.child).toBe('Research');
    expect(result.totalCommitted).toBe(1);
    expect(result.contextSizeKb).toBeGreaterThan(0);

    const tree = await loadTree('release');
    expect(tree.children[0].status).toBe('committed');
    expect(tree.children[0].committed_at).toBeDefined();

    const savedSummary = await readFile(
      join(TEST_DIR, 'trees', 'release', 'children', 'research.md'),
      'utf-8',
    );
    expect(savedSummary).toBe(summary);
  });

  it('rebuilds context.md with committed summary', async () => {
    await createTree('Release', TEST_DIR, []);
    await addChild('release', {
      name: 'Arch',
      slug: 'arch',
      status: 'active',
      claude_session_name: 'Release > Arch',
      created_at: new Date().toISOString(),
    });
    await writeActiveSession({ tree: 'release', child: 'arch' });

    await commitToParent('## Decisions\n- Monorepo');

    const context = await readFile(
      join(TEST_DIR, 'trees', 'release', 'context.md'),
      'utf-8',
    );
    expect(context).toContain('Session: Arch');
    expect(context).toContain('Monorepo');
  });

  it('allows re-committing (updating a previous commit)', async () => {
    await createTree('Release', TEST_DIR, []);
    await addChild('release', {
      name: 'Work',
      slug: 'work',
      status: 'active',
      claude_session_name: 'Release > Work',
      created_at: new Date().toISOString(),
    });
    await writeActiveSession({ tree: 'release', child: 'work' });

    await commitToParent('## Decisions\n- First attempt');
    const result = await commitToParent('## Decisions\n- Updated decision');

    expect(result.totalCommitted).toBe(1);

    const saved = await readFile(
      join(TEST_DIR, 'trees', 'release', 'children', 'work.md'),
      'utf-8',
    );
    expect(saved).toContain('Updated decision');
  });

  it('throws when no active session', async () => {
    await expect(commitToParent('summary')).rejects.toThrow('Not inside a cctree session');
  });

  it('throws when child not found in tree', async () => {
    await createTree('Release', TEST_DIR, []);
    await writeActiveSession({ tree: 'release', child: 'nonexistent' });

    await expect(commitToParent('summary')).rejects.toThrow('not found');
  });
});
