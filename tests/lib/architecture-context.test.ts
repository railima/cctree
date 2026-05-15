import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

const { TEST_DIR } = vi.hoisted(() => {
  const path = require('node:path');
  const os = require('node:os');
  const TEST_DIR = path.join(
    os.tmpdir(),
    `cctree-arch-context-${Date.now()}-${Math.random().toString(36).slice(2)}`,
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
  initialContextDir: (slug: string) =>
    join(TEST_DIR, 'trees', slug, 'initial-context'),
  childrenDir: (slug: string) => join(TEST_DIR, 'trees', slug, 'children'),
  childSummaryPath: (treeSlug: string, childSlug: string) =>
    join(TEST_DIR, 'trees', treeSlug, 'children', `${childSlug}.md`),
  injectContextPath: (slug: string) =>
    join(TEST_DIR, 'trees', slug, '.inject-context.md'),
  worktreesDir: (slug: string) => join(TEST_DIR, 'trees', slug, 'worktrees'),
  worktreePath: (treeSlug: string, childSlug: string) =>
    join(TEST_DIR, 'trees', treeSlug, 'worktrees', childSlug),
  CONTEXT_HOOK_MAX_CHARS: 9500,
}));

import {
  ArchitectureContextError,
  buildArchitectureContext,
  renderArchitectureMarkdown,
  renderArchitectureJson,
} from '../../src/lib/architecture-context.js';
import {
  createTree,
  addChild,
  saveChildSummary,
  updateChildStatus,
} from '../../src/lib/storage.js';

beforeEach(async () => {
  await mkdir(TEST_DIR, { recursive: true });
});

afterEach(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
});

describe('buildArchitectureContext', () => {
  it('throws when the tree has no committed sessions', async () => {
    await createTree('Empty', TEST_DIR, []);
    await expect(buildArchitectureContext('empty')).rejects.toThrow(
      ArchitectureContextError,
    );
  });

  it('returns parsed sessions plus hot files for committed children', async () => {
    await createTree('Arch Test', TEST_DIR, []);
    await addChild('arch-test', {
      name: 'Research',
      slug: 'research',
      status: 'active',
      claude_session_name: 'Arch Test > Research',
      created_at: '2026-04-15T10:00:00Z',
    });
    await saveChildSummary(
      'arch-test',
      'research',
      [
        '## TL;DR',
        'Picked stdio for MCP transport.',
        '',
        '## Decisions',
        '- Use stdio over SSE',
        '',
        '## Artifacts',
        '- src/server.ts',
        '',
        '## Open Questions',
        '- Will SSE be needed for cloud deploys?',
        '',
        '## Details',
        'Touched src/cli.ts and src/lib/git.ts to wire it up.',
      ].join('\n'),
    );
    await updateChildStatus(
      'arch-test',
      'research',
      'committed',
      '2026-04-15T11:00:00Z',
    );

    const ctx = await buildArchitectureContext('arch-test');
    expect(ctx.tree.name).toBe('Arch Test');
    expect(ctx.tree.slug).toBe('arch-test');
    expect(ctx.sessions).toHaveLength(1);
    const session = ctx.sessions[0];
    expect(session.tldr).toContain('Picked stdio');
    expect(session.decisions).toEqual(['Use stdio over SSE']);
    expect(session.artifacts).toEqual(['src/server.ts']);
    expect(session.openQuestions).toEqual([
      'Will SSE be needed for cloud deploys?',
    ]);
    expect(session.committed_at).toBe('2026-04-15T11:00:00Z');

    expect(ctx.hotFiles).toContain('src/server.ts');
    expect(ctx.hotFiles).toContain('src/cli.ts');
    expect(ctx.hotFiles).toContain('src/lib/git.ts');
  });

  it('skips committed sessions with no TL;DR/decisions/artifacts', async () => {
    await createTree('Sparse', TEST_DIR, []);
    await addChild('sparse', {
      name: 'Useful',
      slug: 'useful',
      status: 'active',
      claude_session_name: 'Sparse > Useful',
      created_at: '2026-04-15T10:00:00Z',
    });
    await saveChildSummary(
      'sparse',
      'useful',
      '## TL;DR\nDid something\n\n## Decisions\n- Picked X',
    );
    await updateChildStatus(
      'sparse',
      'useful',
      'committed',
      '2026-04-15T11:00:00Z',
    );

    await addChild('sparse', {
      name: 'Empty',
      slug: 'empty',
      status: 'active',
      claude_session_name: 'Sparse > Empty',
      created_at: '2026-04-15T10:00:00Z',
    });
    await saveChildSummary('sparse', 'empty', '## Details\njust notes\n');
    await updateChildStatus(
      'sparse',
      'empty',
      'committed',
      '2026-04-15T11:00:00Z',
    );

    const ctx = await buildArchitectureContext('sparse');
    expect(ctx.sessions.map((s) => s.slug)).toEqual(['useful']);
  });
});

describe('renderArchitectureMarkdown / renderArchitectureJson', () => {
  it('renders a readable markdown payload', () => {
    const md = renderArchitectureMarkdown({
      tree: { name: 'T', slug: 't' },
      sessions: [
        {
          name: 'S1',
          slug: 's1',
          tldr: 'one-liner',
          decisions: ['use X'],
          artifacts: ['a.ts'],
          openQuestions: [],
          nextSteps: ['ship it'],
          committed_at: '2026-05-01T00:00:00Z',
        },
      ],
      hotFiles: ['a.ts'],
    });
    expect(md).toContain('# Branch architecture context: T');
    expect(md).toContain('## Hot files');
    expect(md).toContain('- a.ts');
    expect(md).toContain('### S1 (`s1`)');
    expect(md).toContain('**TL;DR**');
    expect(md).toContain('one-liner');
    expect(md).toContain('- use X');
    expect(md).toContain('- ship it');
  });

  it('renders structured JSON', () => {
    const json = renderArchitectureJson({
      tree: { name: 'T', slug: 't' },
      sessions: [],
      hotFiles: [],
    });
    expect(JSON.parse(json)).toEqual({
      tree: { name: 'T', slug: 't' },
      sessions: [],
      hotFiles: [],
    });
  });
});
