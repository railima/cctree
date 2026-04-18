import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

const { TEST_DIR } = vi.hoisted(() => {
  const path = require('node:path');
  const os = require('node:os');
  const TEST_DIR = path.join(
    os.tmpdir(),
    `cctree-statusline-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
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
  CONTEXT_HOOK_MAX_CHARS: 9500,
}));

import { createTree, addChild, writeActiveSession } from '../../src/lib/storage.js';
import {
  buildStatusline,
  parseStdinInput,
  resolveBySessionName,
} from '../../src/commands/statusline.js';

beforeEach(async () => {
  await mkdir(TEST_DIR, { recursive: true });
});

afterEach(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
});

describe('buildStatusline', () => {
  it('returns null when no active session exists', async () => {
    const result = await buildStatusline();
    expect(result).toBeNull();
  });

  it('returns null when the active session points at a missing tree', async () => {
    await writeActiveSession({ tree: 'ghost-tree', child: 'ghost-child' });
    const result = await buildStatusline();
    expect(result).toBeNull();
  });

  it('renders the default format with tree and child name', async () => {
    await createTree('Auth Service v2', TEST_DIR, []);
    await addChild('auth-service-v2', {
      name: 'API Design',
      slug: 'api-design',
      status: 'active',
      claude_session_name: 'Auth Service v2 > API Design',
      created_at: new Date().toISOString(),
    });
    await writeActiveSession({ tree: 'auth-service-v2', child: 'api-design' });

    const result = await buildStatusline();
    expect(result).toBe('Auth Service v2 › API Design');
  });

  it('supports custom format with sibling counts', async () => {
    await createTree('Payments', TEST_DIR, []);
    const now = new Date().toISOString();
    await addChild('payments', {
      name: 'Schema',
      slug: 'schema',
      status: 'committed',
      claude_session_name: 'Payments > Schema',
      created_at: now,
      committed_at: now,
    });
    await addChild('payments', {
      name: 'API',
      slug: 'api',
      status: 'active',
      claude_session_name: 'Payments > API',
      created_at: now,
    });
    await writeActiveSession({ tree: 'payments', child: 'api' });

    const result = await buildStatusline({
      format: '{tree} [{child}] {committed}/{total} committed',
    });
    expect(result).toBe('Payments [API] 1/2 committed');
  });

  it('falls back to the child slug when the child is not yet in tree.json', async () => {
    await createTree('Payments', TEST_DIR, []);
    await writeActiveSession({ tree: 'payments', child: 'orphan-session' });

    const result = await buildStatusline({ format: '{tree}/{child}' });
    expect(result).toBe('Payments/orphan-session');
  });

  it('substitutes unknown placeholders with empty string', async () => {
    await createTree('T', TEST_DIR, []);
    await writeActiveSession({ tree: 't', child: 'x' });

    const result = await buildStatusline({ format: '{tree}|{bogus}|end' });
    expect(result).toBe('T||end');
  });

  it('exposes tree_slug and child_slug', async () => {
    await createTree('My Project', TEST_DIR, []);
    await addChild('my-project', {
      name: 'Step One',
      slug: 'step-one',
      status: 'active',
      claude_session_name: 'My Project > Step One',
      created_at: new Date().toISOString(),
    });
    await writeActiveSession({ tree: 'my-project', child: 'step-one' });

    const result = await buildStatusline({ format: '{tree_slug}:{child_slug}' });
    expect(result).toBe('my-project:step-one');
  });

  it('prefers stdin session_name over active-session.json', async () => {
    await createTree('Alpha', TEST_DIR, []);
    await addChild('alpha', {
      name: 'Work',
      slug: 'work',
      status: 'active',
      claude_session_name: 'Alpha > Work',
      created_at: new Date().toISOString(),
    });

    await createTree('Beta', TEST_DIR, []);
    await addChild('beta', {
      name: 'Other',
      slug: 'other',
      status: 'active',
      claude_session_name: 'Beta > Other',
      created_at: new Date().toISOString(),
    });

    await writeActiveSession({ tree: 'beta', child: 'other' });

    const result = await buildStatusline({}, { sessionName: 'Alpha > Work' });
    expect(result).toBe('Alpha › Work');
  });

  it('falls back to active-session.json when stdin session_name does not match any tree', async () => {
    await createTree('Alpha', TEST_DIR, []);
    await addChild('alpha', {
      name: 'Work',
      slug: 'work',
      status: 'active',
      claude_session_name: 'Alpha > Work',
      created_at: new Date().toISOString(),
    });
    await writeActiveSession({ tree: 'alpha', child: 'work' });

    const result = await buildStatusline({}, { sessionName: 'Unknown > Thing' });
    expect(result).toBe('Alpha › Work');
  });
});

describe('resolveBySessionName', () => {
  it('matches "Tree > Child" names against existing trees', async () => {
    await createTree('Payments', TEST_DIR, []);
    await addChild('payments', {
      name: 'Webhook Handler',
      slug: 'webhook-handler',
      status: 'active',
      claude_session_name: 'Payments > Webhook Handler',
      created_at: new Date().toISOString(),
    });

    const result = await resolveBySessionName('Payments > Webhook Handler');
    expect(result?.tree.slug).toBe('payments');
    expect(result?.child.slug).toBe('webhook-handler');
  });

  it('returns null when the session name does not correspond to any tree/child pair', async () => {
    await createTree('Payments', TEST_DIR, []);
    expect(await resolveBySessionName('Unknown > Child')).toBeNull();
    expect(await resolveBySessionName('Payments > MissingChild')).toBeNull();
  });

  it('handles child names that contain ">"', async () => {
    await createTree('Root', TEST_DIR, []);
    await addChild('root', {
      name: 'A > B',
      slug: 'a-b',
      status: 'active',
      claude_session_name: 'Root > A > B',
      created_at: new Date().toISOString(),
    });

    const result = await resolveBySessionName('Root > A > B');
    expect(result?.child.name).toBe('A > B');
  });
});

describe('parseStdinInput', () => {
  it('returns null for empty input', () => {
    expect(parseStdinInput('')).toBeNull();
    expect(parseStdinInput('   ')).toBeNull();
  });

  it('returns null for invalid JSON', () => {
    expect(parseStdinInput('not json')).toBeNull();
  });

  it('extracts session_name when present', () => {
    const result = parseStdinInput('{"session_name": "Tree > Child"}');
    expect(result).toEqual({ sessionName: 'Tree > Child' });
  });

  it('returns an empty object when JSON is valid but has no session_name', () => {
    const result = parseStdinInput('{"other": "value"}');
    expect(result).toEqual({});
  });
});
