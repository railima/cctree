import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdir, readFile, rm, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const { TEST_DIR } = vi.hoisted(() => {
  const path = require('node:path');
  const os = require('node:os');
  const TEST_DIR = path.join(
    os.tmpdir(),
    `cctree-obsidian-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
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
  renderIndex,
  renderTreeIndex,
  renderChild,
  exportToObsidian,
} from '../../src/lib/obsidian.js';
import { createTree, addChild, saveChildSummary } from '../../src/lib/storage.js';
import type { TreeConfig, ChildSession } from '../../src/types/index.js';

beforeEach(async () => {
  await mkdir(TEST_DIR, { recursive: true });
});

afterEach(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
});

function makeChild(overrides: Partial<ChildSession> = {}): ChildSession {
  return {
    name: 'Child',
    slug: 'child',
    status: 'active',
    claude_session_name: 'Tree > Child',
    created_at: '2026-04-15T10:00:00Z',
    ...overrides,
  };
}

function makeTree(overrides: Partial<TreeConfig> = {}): TreeConfig {
  return {
    name: 'Tree',
    slug: 'tree',
    created_at: '2026-04-10T10:00:00Z',
    cwd: '/tmp/project',
    initial_context_files: [],
    children: [],
    ...overrides,
  };
}

describe('renderIndex', () => {
  it('lists trees with their session counts', () => {
    const a = makeTree({
      name: 'Auth',
      slug: 'auth',
      children: [
        makeChild({ slug: 'a', status: 'committed', committed_at: '2026-04-15T18:00:00Z' }),
        makeChild({ slug: 'b', status: 'active' }),
      ],
    });
    const b = makeTree({ name: 'Payments', slug: 'payments' });
    const out = renderIndex([a, b]);
    expect(out).toContain('[[auth/_index|Auth]] — 1 committed, 1 active');
    expect(out).toContain('[[payments/_index|Payments]] — no sessions yet');
    expect(out).toContain('Total: 2 trees, 2 sessions.');
  });

  it('renders an empty-state message when no trees exist', () => {
    const out = renderIndex([]);
    expect(out).toContain('No trees yet');
    expect(out).not.toContain('Total:');
  });
});

describe('renderTreeIndex', () => {
  it('renders a wiki-link for committed children and a plain line for non-committed', () => {
    const tree = makeTree({
      name: 'Auth',
      slug: 'auth',
      children: [
        makeChild({
          name: 'Research',
          slug: 'research',
          status: 'committed',
          committed_at: '2026-04-15T18:00:00Z',
        }),
        makeChild({ name: 'API', slug: 'api', status: 'active' }),
        makeChild({ name: 'Old', slug: 'old', status: 'abandoned' }),
      ],
    });
    const out = renderTreeIndex(tree);
    expect(out).toContain('- [[research]] · ✓ committed Apr 15');
    expect(out).toContain('- API · ⚡ active (no summary yet)');
    expect(out).toContain('- Old · ✗ abandoned');
  });

  it('marks committed children with missing summaries', () => {
    const tree = makeTree({
      children: [
        makeChild({
          name: 'Research',
          slug: 'research',
          status: 'committed',
          committed_at: '2026-04-15T18:00:00Z',
        }),
      ],
    });
    const out = renderTreeIndex(tree, new Set(['research']));
    expect(out).toContain('- Research · ✓ committed Apr 15 (missing summary)');
    expect(out).not.toContain('[[research]]');
  });

  it('renders an empty-state when tree has no children', () => {
    const out = renderTreeIndex(makeTree());
    expect(out).toContain('_No sessions yet._');
  });
});

describe('renderChild', () => {
  it('emits frontmatter, parent link, siblings, summary verbatim and related files', () => {
    const tree = makeTree({
      name: 'Auth Service v2',
      slug: 'auth-service-v2',
      children: [
        makeChild({
          name: 'Architecture Research',
          slug: 'architecture-research',
          status: 'committed',
          created_at: '2026-04-14T10:00:00Z',
          committed_at: '2026-04-15T18:00:00Z',
          worktree: {
            path: '/tmp/wt',
            branch: 'cctree/auth-service-v2/architecture-research',
            base_ref: 'a'.repeat(40),
          },
        }),
        makeChild({
          slug: 'database-schema',
          name: 'Database Schema',
          status: 'committed',
          committed_at: '2026-04-17T18:00:00Z',
        }),
        makeChild({ slug: 'api', name: 'API', status: 'active' }),
      ],
    });
    const summary = `## Decisions
- Chose microservices

## Artifacts Created
- src/events/publisher.ts
- docs/architecture-diagram.md

## Open Questions
- None yet.`;

    const child = tree.children[0];
    const out = renderChild(tree, child, summary);

    expect(out).toMatch(/^---\n/);
    expect(out).toContain('tree: auth-service-v2');
    expect(out).toContain('tree-name: "Auth Service v2"');
    expect(out).toContain('status: committed');
    expect(out).toContain('created: 2026-04-14T10:00:00Z');
    expect(out).toContain('committed: 2026-04-15T18:00:00Z');
    expect(out).toContain('worktree-branch: "cctree/auth-service-v2/architecture-research"');
    expect(out).toContain('tags: [cctree, "cctree/tree/auth-service-v2", "cctree/status/committed"]');

    expect(out).toContain('# Architecture Research');
    expect(out).toContain('Parte de [[_index|Auth Service v2]].');
    expect(out).toContain('Irmãs committed: [[database-schema]]');
    expect(out).not.toContain('[[api]]'); // active siblings excluded

    expect(out).toContain('## Decisions');
    expect(out).toContain('Chose microservices');

    expect(out).toContain('## Related files');
    expect(out).toContain('- [[file:src/events/publisher.ts]]');
    expect(out).toContain('- [[file:docs/architecture-diagram.md]]');
  });

  it('omits the Related files section when no paths are detected', () => {
    const tree = makeTree();
    const child = makeChild({ status: 'committed', committed_at: '2026-04-15T18:00:00Z' });
    const summary = '## Decisions\n- A plain decision with no file references.';
    const out = renderChild(tree, child, summary);
    expect(out).not.toContain('## Related files');
  });

  it('omits the worktree-branch frontmatter field when the child has no worktree', () => {
    const tree = makeTree();
    const child = makeChild({ status: 'committed', committed_at: '2026-04-15T18:00:00Z' });
    const out = renderChild(tree, child, '## Decisions\n- x');
    expect(out).not.toContain('worktree-branch');
  });
});

async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

describe('exportToObsidian', () => {
  it('throws when the vault path does not exist', async () => {
    await expect(exportToObsidian('/nonexistent-path-for-cctree', [])).rejects.toThrow(/does not exist/);
  });

  it('writes index.md + per-tree _index.md + per-committed-child file', async () => {
    const vault = join(TEST_DIR, 'vault');
    await mkdir(vault, { recursive: true });

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
      '## Decisions\n- Use JWT.\n\n## Artifacts Created\n- src/auth.ts',
    );
    await addChild('auth-service-v2', {
      name: 'API',
      slug: 'api',
      status: 'active',
      claude_session_name: 'Auth Service v2 > API',
      created_at: '2026-04-16T10:00:00Z',
    });

    const { listTrees } = await import('../../src/lib/storage.js');
    const trees = await listTrees();

    const result = await exportToObsidian(vault, trees);

    expect(result.treesWritten).toBe(1);
    expect(result.childrenWritten).toBe(1);

    expect(await pathExists(join(vault, 'cctree', 'index.md'))).toBe(true);
    expect(await pathExists(join(vault, 'cctree', 'auth-service-v2', '_index.md'))).toBe(true);
    expect(await pathExists(join(vault, 'cctree', 'auth-service-v2', 'research.md'))).toBe(true);
    expect(await pathExists(join(vault, 'cctree', 'auth-service-v2', 'api.md'))).toBe(false);

    const childContent = await readFile(
      join(vault, 'cctree', 'auth-service-v2', 'research.md'),
      'utf-8',
    );
    expect(childContent).toContain('[[file:src/auth.ts]]');
  });

  it('marks committed children whose summary file is missing', async () => {
    const vault = join(TEST_DIR, 'vault');
    await mkdir(vault, { recursive: true });

    await createTree('Tree', TEST_DIR, []);
    await addChild('tree', {
      name: 'Ghost',
      slug: 'ghost',
      status: 'committed',
      claude_session_name: 'Tree > Ghost',
      created_at: '2026-04-15T10:00:00Z',
      committed_at: '2026-04-15T18:00:00Z',
    });
    // intentionally do NOT call saveChildSummary

    const { listTrees } = await import('../../src/lib/storage.js');
    const trees = await listTrees();

    await exportToObsidian(vault, trees);

    const indexContent = await readFile(
      join(vault, 'cctree', 'tree', '_index.md'),
      'utf-8',
    );
    expect(indexContent).toContain('(missing summary)');
    expect(await pathExists(join(vault, 'cctree', 'tree', 'ghost.md'))).toBe(false);
  });

  it('is idempotent: running twice produces the same layout', async () => {
    const vault = join(TEST_DIR, 'vault');
    await mkdir(vault, { recursive: true });

    await createTree('Tree', TEST_DIR, []);
    await addChild('tree', {
      name: 'A',
      slug: 'a',
      status: 'committed',
      claude_session_name: 'Tree > A',
      created_at: '2026-04-15T10:00:00Z',
      committed_at: '2026-04-15T18:00:00Z',
    });
    await saveChildSummary('tree', 'a', '## Decisions\n- x');

    const { listTrees } = await import('../../src/lib/storage.js');
    const trees = await listTrees();

    await exportToObsidian(vault, trees);
    const firstContent = await readFile(join(vault, 'cctree', 'tree', 'a.md'), 'utf-8');

    await exportToObsidian(vault, trees);
    const secondContent = await readFile(join(vault, 'cctree', 'tree', 'a.md'), 'utf-8');

    expect(secondContent).toBe(firstContent);
  });

  it('does not touch files outside cctree/', async () => {
    const vault = join(TEST_DIR, 'vault');
    await mkdir(vault, { recursive: true });
    await writeFile(join(vault, 'my-note.md'), 'hello');

    await createTree('Tree', TEST_DIR, []);
    const { listTrees } = await import('../../src/lib/storage.js');
    const trees = await listTrees();
    await exportToObsidian(vault, trees);

    const content = await readFile(join(vault, 'my-note.md'), 'utf-8');
    expect(content).toBe('hello');
  });

  it('with --tree focus, only rewrites that tree subfolder and skips the MOC', async () => {
    const vault = join(TEST_DIR, 'vault');
    await mkdir(vault, { recursive: true });
    // pre-seed vault with a stray index.md we expect to remain untouched
    await mkdir(join(vault, 'cctree'), { recursive: true });
    await writeFile(join(vault, 'cctree', 'index.md'), '# pre-existing');

    await createTree('Alpha', TEST_DIR, []);
    await createTree('Beta', TEST_DIR, []);
    await addChild('alpha', {
      name: 'A1',
      slug: 'a1',
      status: 'committed',
      claude_session_name: 'Alpha > A1',
      created_at: '2026-04-15T10:00:00Z',
      committed_at: '2026-04-15T18:00:00Z',
    });
    await saveChildSummary('alpha', 'a1', '## Decisions\n- x');

    const { listTrees, resolveTree } = await import('../../src/lib/storage.js');
    const trees = await listTrees();
    const alpha = await resolveTree('alpha');

    await exportToObsidian(vault, trees, { tree: alpha });

    // Alpha subfolder got written
    expect(await pathExists(join(vault, 'cctree', 'alpha', '_index.md'))).toBe(true);
    expect(await pathExists(join(vault, 'cctree', 'alpha', 'a1.md'))).toBe(true);

    // Beta subfolder was NOT created
    expect(await pathExists(join(vault, 'cctree', 'beta'))).toBe(false);

    // Pre-existing index.md was not overwritten
    const index = await readFile(join(vault, 'cctree', 'index.md'), 'utf-8');
    expect(index).toBe('# pre-existing');
  });
});
