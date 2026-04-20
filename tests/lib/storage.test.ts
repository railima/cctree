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
  worktreesDir: (slug: string) => join(TEST_DIR, 'trees', slug, 'worktrees'),
  worktreePath: (treeSlug: string, childSlug: string) =>
    join(TEST_DIR, 'trees', treeSlug, 'worktrees', childSlug),
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
  addContextFiles,
  resolveTree,
  abandonChild,
  renameTree,
} from '../../src/lib/storage.js';
import type { ChildSession } from '../../src/types/index.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { stat } from 'node:fs/promises';
const run = promisify(execFile);

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

  it('throws for names that produce empty slugs', async () => {
    await expect(createTree('...', TEST_DIR, [])).rejects.toThrow('alphanumeric');
    await expect(createTree('////', TEST_DIR, [])).rejects.toThrow('alphanumeric');
  });

  it('rejects context files outside working directory', async () => {
    await expect(
      createTree('Escape', TEST_DIR, ['../../etc/passwd']),
    ).rejects.toThrow('outside the working directory');
  });

  it('rejects absolute context file paths outside cwd', async () => {
    await expect(
      createTree('Absolute', TEST_DIR, ['/etc/hosts']),
    ).rejects.toThrow('outside the working directory');
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

describe('addContextFiles', () => {
  it('copies files into initial-context and updates the config', async () => {
    const cwd = join(TEST_DIR, 'fixtures');
    await mkdir(cwd, { recursive: true });
    await writeFile(join(cwd, 'spec.md'), '# Spec');
    await createTree('Later', cwd, []);

    await writeFile(join(cwd, 'plan.md'), '# Plan');
    const { added, tree } = await addContextFiles('later', cwd, ['spec.md', 'plan.md']);

    expect(added).toEqual(['spec.md', 'plan.md']);
    expect(tree.initial_context_files).toEqual(['spec.md', 'plan.md']);

    const spec = await readFile(
      join(TEST_DIR, 'trees', 'later', 'initial-context', 'spec.md'),
      'utf-8',
    );
    expect(spec).toBe('# Spec');
  });

  it('rebuilds context.md to include the new files', async () => {
    const cwd = join(TEST_DIR, 'fixtures');
    await mkdir(cwd, { recursive: true });
    await createTree('Ctx', cwd, []);
    await writeFile(join(cwd, 'notes.md'), 'hello world');

    await addContextFiles('ctx', cwd, ['notes.md']);

    const ctx = await readFile(
      join(TEST_DIR, 'trees', 'ctx', 'context.md'),
      'utf-8',
    );
    expect(ctx).toContain('## Initial Context');
    expect(ctx).toContain('### notes.md');
    expect(ctx).toContain('hello world');
  });

  it('dedupes when the same filename is added twice', async () => {
    const cwd = join(TEST_DIR, 'fixtures');
    await mkdir(cwd, { recursive: true });
    await writeFile(join(cwd, 'doc.md'), 'v1');
    await createTree('Dedupe', cwd, ['doc.md']);

    await writeFile(join(cwd, 'doc.md'), 'v2');
    const { tree } = await addContextFiles('dedupe', cwd, ['doc.md']);

    expect(tree.initial_context_files).toEqual(['doc.md']);
    const copied = await readFile(
      join(TEST_DIR, 'trees', 'dedupe', 'initial-context', 'doc.md'),
      'utf-8',
    );
    expect(copied).toBe('v2');
  });

  it('rejects files outside the working directory', async () => {
    await createTree('Guarded', TEST_DIR, []);
    await expect(
      addContextFiles('guarded', TEST_DIR, ['../../etc/passwd']),
    ).rejects.toThrow('outside the working directory');
  });

  it('rejects absolute paths outside cwd', async () => {
    await createTree('Abs', TEST_DIR, []);
    await expect(
      addContextFiles('abs', TEST_DIR, ['/etc/hosts']),
    ).rejects.toThrow('outside the working directory');
  });

  it('throws for unknown tree slug', async () => {
    await expect(
      addContextFiles('does-not-exist', TEST_DIR, []),
    ).rejects.toThrow('not found');
  });
});

describe('resolveTree', () => {
  it('resolves by exact slug', async () => {
    await createTree('Alpha One', TEST_DIR, []);
    const tree = await resolveTree('alpha-one');
    expect(tree.name).toBe('Alpha One');
  });

  it('resolves by name (case-insensitive)', async () => {
    await createTree('Beta Two', TEST_DIR, []);
    const tree = await resolveTree('BETA TWO');
    expect(tree.slug).toBe('beta-two');
  });

  it('throws with available trees listed when not found', async () => {
    await createTree('Alpha', TEST_DIR, []);
    await expect(resolveTree('missing')).rejects.toThrow(/not found[\s\S]*alpha/i);
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

async function makeRepo(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
  await run('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  await run('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
  await run('git', ['config', 'user.name', 'Test'], { cwd: dir });
  await run('git', ['config', 'commit.gpgsign', 'false'], { cwd: dir });
  await writeFile(join(dir, 'README.md'), '# test\n');
  await run('git', ['add', '.'], { cwd: dir });
  await run('git', ['commit', '-q', '-m', 'init'], { cwd: dir });
}

describe('abandonChild', () => {
  it('marks a child as abandoned by default', async () => {
    await createTree('Tree', TEST_DIR, []);
    await addChild('tree', {
      name: 'Research',
      slug: 'research',
      status: 'active',
      claude_session_name: 'Tree > Research',
      created_at: new Date().toISOString(),
    });

    const result = await abandonChild('tree', 'research');
    expect(result.mode).toBe('marked');

    const loaded = await loadTree('tree');
    expect(loaded.children[0].status).toBe('abandoned');
  });

  it('excludes abandoned children from rebuilt context', async () => {
    await createTree('Tree', TEST_DIR, []);
    const now = new Date().toISOString();
    await addChild('tree', {
      name: 'Committed',
      slug: 'committed',
      status: 'committed',
      claude_session_name: 'Tree > Committed',
      created_at: now,
      committed_at: now,
    });
    await saveChildSummary('tree', 'committed', '## Decisions\n- something important');

    await abandonChild('tree', 'committed');

    const ctx = await readFile(join(TEST_DIR, 'trees', 'tree', 'context.md'), 'utf-8');
    expect(ctx).not.toContain('something important');
  });

  it('deletes a child entirely with --delete', async () => {
    await createTree('Tree', TEST_DIR, []);
    await addChild('tree', {
      name: 'Research',
      slug: 'research',
      status: 'active',
      claude_session_name: 'Tree > Research',
      created_at: new Date().toISOString(),
    });
    await saveChildSummary('tree', 'research', '# summary');

    const result = await abandonChild('tree', 'research', { delete: true });
    expect(result.mode).toBe('deleted');

    const loaded = await loadTree('tree');
    expect(loaded.children).toHaveLength(0);

    await expect(
      stat(join(TEST_DIR, 'trees', 'tree', 'children', 'research.md')),
    ).rejects.toThrow();
  });

  it('clears active-session.json when deleting the current child', async () => {
    await createTree('Tree', TEST_DIR, []);
    await addChild('tree', {
      name: 'Active',
      slug: 'active-child',
      status: 'active',
      claude_session_name: 'Tree > Active',
      created_at: new Date().toISOString(),
    });
    await writeActiveSession({ tree: 'tree', child: 'active-child' });

    await abandonChild('tree', 'active-child', { delete: true });

    expect(await readActiveSession()).toBeNull();
  });

  it('leaves active-session.json alone when abandoning a different child', async () => {
    await createTree('Tree', TEST_DIR, []);
    await addChild('tree', {
      name: 'A',
      slug: 'a',
      status: 'active',
      claude_session_name: 'Tree > A',
      created_at: new Date().toISOString(),
    });
    await addChild('tree', {
      name: 'B',
      slug: 'b',
      status: 'active',
      claude_session_name: 'Tree > B',
      created_at: new Date().toISOString(),
    });
    await writeActiveSession({ tree: 'tree', child: 'b' });

    await abandonChild('tree', 'a', { delete: true });

    const session = await readActiveSession();
    expect(session).toEqual({ tree: 'tree', child: 'b' });
  });

  it('throws when the child does not exist', async () => {
    await createTree('Tree', TEST_DIR, []);
    await expect(abandonChild('tree', 'nope')).rejects.toThrow('not found');
  });

  it('removes the worktree and auto-named branch on --delete', async () => {
    const repoDir = join(TEST_DIR, 'repo');
    await makeRepo(repoDir);

    await createTree('Tree', repoDir, []);

    const wtPath = join(TEST_DIR, 'trees', 'tree', 'worktrees', 'api');
    await run('git', ['worktree', 'add', '-b', 'cctree/tree/api', wtPath], {
      cwd: repoDir,
    });

    await addChild('tree', {
      name: 'API',
      slug: 'api',
      status: 'active',
      claude_session_name: 'Tree > API',
      created_at: new Date().toISOString(),
      worktree: {
        path: wtPath,
        branch: 'cctree/tree/api',
        base_ref: 'deadbeef',
      },
    });

    const result = await abandonChild('tree', 'api', { delete: true });
    expect(result.removedWorktree).toBe(wtPath);
    expect(result.removedBranch).toBe('cctree/tree/api');

    const { stdout } = await run('git', ['branch', '--list', 'cctree/tree/api'], {
      cwd: repoDir,
    });
    expect(stdout.trim()).toBe('');
    await expect(stat(wtPath)).rejects.toThrow();
  });
});

describe('renameTree', () => {
  it('updates the display name only by default', async () => {
    await createTree('Old Name', TEST_DIR, []);

    const result = await renameTree('old-name', { newName: 'New Name' });
    expect(result.oldName).toBe('Old Name');
    expect(result.newName).toBe('New Name');
    expect(result.oldSlug).toBe('old-name');
    expect(result.newSlug).toBe('old-name');

    const loaded = await loadTree('old-name');
    expect(loaded.name).toBe('New Name');
  });

  it('renames the slug and moves the on-disk directory', async () => {
    await createTree('Old', TEST_DIR, []);

    await renameTree('old', { newName: 'New', newSlug: 'new' });

    await expect(stat(join(TEST_DIR, 'trees', 'old'))).rejects.toThrow();
    const loaded = await loadTree('new');
    expect(loaded.slug).toBe('new');
    expect(loaded.name).toBe('New');
  });

  it('updates active-tree pointer when renaming the active tree', async () => {
    await createTree('Foo', TEST_DIR, []);
    await setActiveTree('foo');

    await renameTree('foo', { newName: 'Bar', newSlug: 'bar' });

    const active = await getActiveTree();
    expect(active?.slug).toBe('bar');
  });

  it('updates active-session.json when renaming the current tree', async () => {
    await createTree('Foo', TEST_DIR, []);
    await addChild('foo', {
      name: 'Session',
      slug: 'session',
      status: 'active',
      claude_session_name: 'Foo > Session',
      created_at: new Date().toISOString(),
    });
    await writeActiveSession({ tree: 'foo', child: 'session' });

    await renameTree('foo', { newName: 'Bar', newSlug: 'bar' });

    const session = await readActiveSession();
    expect(session).toEqual({ tree: 'bar', child: 'session' });
  });

  it('throws when the new slug is already taken', async () => {
    await createTree('Alpha', TEST_DIR, []);
    await createTree('Beta', TEST_DIR, []);

    await expect(
      renameTree('alpha', { newName: 'Alpha Renamed', newSlug: 'beta' }),
    ).rejects.toThrow('already taken');
  });

  it('rejects invalid new slugs', async () => {
    await createTree('Foo', TEST_DIR, []);
    await expect(
      renameTree('foo', { newName: 'Foo', newSlug: '...' }),
    ).rejects.toThrow('alphanumeric');
  });

  it('renames auto-named git branches and repairs worktrees on slug rename', async () => {
    const repoDir = join(TEST_DIR, 'repo');
    await makeRepo(repoDir);

    await createTree('Tree', repoDir, []);

    const wtPath = join(TEST_DIR, 'trees', 'tree', 'worktrees', 'api');
    await run('git', ['worktree', 'add', '-b', 'cctree/tree/api', wtPath], {
      cwd: repoDir,
    });

    await addChild('tree', {
      name: 'API',
      slug: 'api',
      status: 'active',
      claude_session_name: 'Tree > API',
      created_at: new Date().toISOString(),
      worktree: {
        path: wtPath,
        branch: 'cctree/tree/api',
        base_ref: 'deadbeef',
      },
    });

    const result = await renameTree('tree', { newName: 'Renamed', newSlug: 'renamed' });

    expect(result.renamedBranches).toEqual([
      { from: 'cctree/tree/api', to: 'cctree/renamed/api' },
    ]);
    expect(result.movedWorktrees).toHaveLength(1);

    const loaded = await loadTree('renamed');
    expect(loaded.children[0].worktree?.branch).toBe('cctree/renamed/api');
    expect(loaded.children[0].worktree?.path).toBe(
      join(TEST_DIR, 'trees', 'renamed', 'worktrees', 'api'),
    );

    const { stdout } = await run(
      'git',
      ['branch', '--list', 'cctree/renamed/api'],
      { cwd: repoDir },
    );
    expect(stdout.trim()).toContain('cctree/renamed/api');
  });
});
