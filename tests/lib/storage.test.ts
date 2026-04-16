import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const { TEST_DIR } = vi.hoisted(() => {
  const path = require('node:path');
  const os = require('node:os');
  const TEST_DIR = path.join(os.tmpdir(), `cctree-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
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
  loadTree,
  getActiveTree,
  setActiveTree,
  addChild,
  updateChildStatus,
  saveChildSummary,
  loadChildSummary,
  listTrees,
  findChildByNameOrSlug,
  writeActiveSession,
  readActiveSession,
} from '../../src/lib/storage.js';
import type { ChildSession } from '../../src/types/index.js';

beforeEach(async () => {
  await mkdir(TEST_DIR, { recursive: true });
});

afterEach(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
});

describe('createTree', () => {
  it('creates a tree with correct structure', async () => {
    const contextDir = join(TEST_DIR, 'fixtures');
    await mkdir(contextDir, { recursive: true });
    await writeFile(join(contextDir, 'spec.md'), '# Spec\nSome spec content');

    const tree = await createTree('My Release', contextDir, ['spec.md']);

    expect(tree.name).toBe('My Release');
    expect(tree.slug).toBe('my-release');
    expect(tree.initial_context_files).toEqual(['spec.md']);
    expect(tree.children).toEqual([]);
    expect(tree.cwd).toBe(contextDir);

    const loaded = await loadTree('my-release');
    expect(loaded.name).toBe('My Release');
  });

  it('copies context files to initial-context dir', async () => {
    const contextDir = join(TEST_DIR, 'fixtures');
    await mkdir(contextDir, { recursive: true });
    await writeFile(join(contextDir, 'doc.md'), 'Hello');

    await createTree('Test Tree', contextDir, ['doc.md']);

    const copied = await readFile(
      join(TEST_DIR, 'trees', 'test-tree', 'initial-context', 'doc.md'),
      'utf-8',
    );
    expect(copied).toBe('Hello');
  });

  it('throws if tree already exists', async () => {
    const contextDir = join(TEST_DIR, 'fixtures');
    await mkdir(contextDir, { recursive: true });

    await createTree('Dupe', contextDir, []);
    await expect(createTree('Dupe', contextDir, [])).rejects.toThrow('already exists');
  });

  it('creates tree with no context files', async () => {
    const tree = await createTree('Empty', TEST_DIR, []);
    expect(tree.initial_context_files).toEqual([]);
  });
});

describe('activeTree', () => {
  it('returns null when no active tree', async () => {
    const result = await getActiveTree();
    expect(result).toBeNull();
  });

  it('sets and gets active tree', async () => {
    await createTree('Active Test', TEST_DIR, []);
    await setActiveTree('active-test');

    const active = await getActiveTree();
    expect(active?.slug).toBe('active-test');
  });
});

describe('addChild', () => {
  it('adds a child to the tree', async () => {
    await createTree('Parent', TEST_DIR, []);

    const child: ChildSession = {
      name: 'Research',
      slug: 'research',
      status: 'active',
      claude_session_name: 'Parent > Research',
      created_at: new Date().toISOString(),
    };

    await addChild('parent', child);

    const loaded = await loadTree('parent');
    expect(loaded.children).toHaveLength(1);
    expect(loaded.children[0].name).toBe('Research');
  });

  it('throws on duplicate child', async () => {
    await createTree('Parent', TEST_DIR, []);

    const child: ChildSession = {
      name: 'Research',
      slug: 'research',
      status: 'active',
      claude_session_name: 'Parent > Research',
      created_at: new Date().toISOString(),
    };

    await addChild('parent', child);
    await expect(addChild('parent', child)).rejects.toThrow('already exists');
  });
});

describe('updateChildStatus', () => {
  it('updates status and committed_at', async () => {
    await createTree('Tree', TEST_DIR, []);
    await addChild('tree', {
      name: 'Session A',
      slug: 'session-a',
      status: 'active',
      claude_session_name: 'Tree > Session A',
      created_at: new Date().toISOString(),
    });

    const now = new Date().toISOString();
    await updateChildStatus('tree', 'session-a', 'committed', now);

    const loaded = await loadTree('tree');
    expect(loaded.children[0].status).toBe('committed');
    expect(loaded.children[0].committed_at).toBe(now);
  });

  it('throws for unknown child', async () => {
    await createTree('Tree', TEST_DIR, []);
    await expect(
      updateChildStatus('tree', 'nonexistent', 'committed'),
    ).rejects.toThrow('not found');
  });
});

describe('childSummary', () => {
  it('saves and loads child summary', async () => {
    await createTree('Tree', TEST_DIR, []);

    await saveChildSummary('tree', 'session-a', '## Decisions\n- Use TypeScript');
    const content = await loadChildSummary('tree', 'session-a');
    expect(content).toBe('## Decisions\n- Use TypeScript');
  });

  it('throws when loading missing summary', async () => {
    await createTree('Tree', TEST_DIR, []);
    await expect(loadChildSummary('tree', 'missing')).rejects.toThrow(
      'not have been committed',
    );
  });
});

describe('listTrees', () => {
  it('lists all trees sorted by creation date', async () => {
    await createTree('Alpha', TEST_DIR, []);
    await createTree('Beta', TEST_DIR, []);

    const trees = await listTrees();
    expect(trees).toHaveLength(2);
    expect(trees[0].slug).toBe('alpha');
    expect(trees[1].slug).toBe('beta');
  });

  it('returns empty array when no trees exist', async () => {
    const trees = await listTrees();
    expect(trees).toEqual([]);
  });
});

describe('findChildByNameOrSlug', () => {
  it('finds by name (case-insensitive)', async () => {
    await createTree('Tree', TEST_DIR, []);
    await addChild('tree', {
      name: 'Architecture',
      slug: 'architecture',
      status: 'active',
      claude_session_name: 'Tree > Architecture',
      created_at: new Date().toISOString(),
    });

    const updated = await loadTree('tree');
    const found = await findChildByNameOrSlug(updated, 'ARCHITECTURE');
    expect(found?.slug).toBe('architecture');
  });

  it('finds by slug', async () => {
    await createTree('Tree', TEST_DIR, []);
    await addChild('tree', {
      name: 'My Session',
      slug: 'my-session',
      status: 'active',
      claude_session_name: 'Tree > My Session',
      created_at: new Date().toISOString(),
    });

    const updated = await loadTree('tree');
    const found = await findChildByNameOrSlug(updated, 'my-session');
    expect(found?.name).toBe('My Session');
  });

  it('returns null for no match', async () => {
    const tree = await createTree('Tree', TEST_DIR, []);
    const found = await findChildByNameOrSlug(tree, 'nope');
    expect(found).toBeNull();
  });
});

describe('activeSession', () => {
  it('writes and reads active session', async () => {
    await writeActiveSession({ tree: 'my-tree', child: 'my-child' });
    const session = await readActiveSession();
    expect(session).toEqual({ tree: 'my-tree', child: 'my-child' });
  });

  it('returns null when no active session', async () => {
    const session = await readActiveSession();
    expect(session).toBeNull();
  });
});
