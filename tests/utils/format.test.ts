import { describe, it, expect } from 'vitest';
import { formatTree, formatTreePlain } from '../../src/utils/format.js';
import type { TreeConfig } from '../../src/types/index.js';

function makeTree(overrides: Partial<TreeConfig> = {}): TreeConfig {
  return {
    name: 'Auth Service v2',
    slug: 'auth-service-v2',
    created_at: '2026-04-16T10:00:00Z',
    cwd: '/tmp/project',
    initial_context_files: [],
    children: [],
    ...overrides,
  };
}

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

describe('formatTree', () => {
  it('includes slug next to the tree name', () => {
    const out = stripAnsi(formatTree(makeTree(), false));
    expect(out).toContain('Auth Service v2 (auth-service-v2)');
    expect(out).not.toContain('(active)');
  });

  it('appends the active tag after the slug', () => {
    const out = stripAnsi(formatTree(makeTree(), true));
    expect(out).toContain('Auth Service v2 (auth-service-v2) (active)');
  });

  it('shows an empty state when there are no children', () => {
    const out = stripAnsi(formatTree(makeTree(), false));
    expect(out).toContain('(no sessions yet)');
  });

  it('renders committed children with their date', () => {
    const tree = makeTree({
      children: [
        {
          name: 'Research',
          slug: 'research',
          status: 'committed',
          claude_session_name: 'Auth Service v2 > Research',
          created_at: '2026-04-15T10:00:00Z',
          committed_at: '2026-04-16T18:00:00Z',
        },
      ],
    });
    const out = stripAnsi(formatTree(tree, false));
    expect(out).toContain('committed');
    expect(out).toContain('Research');
    expect(out).toMatch(/\(Apr 16\)/);
  });

  it('tags children that have an attached worktree', () => {
    const tree = makeTree({
      children: [
        {
          name: 'API',
          slug: 'api',
          status: 'active',
          claude_session_name: 'Auth Service v2 > API',
          created_at: '2026-04-18T10:00:00Z',
          worktree: {
            path: '/tmp/wt',
            branch: 'cctree/auth-service-v2/api',
            base_ref: 'a'.repeat(40),
          },
        },
      ],
    });
    const out = stripAnsi(formatTree(tree, false));
    expect(out).toContain('[worktree: cctree/auth-service-v2/api]');
  });
});

describe('formatTreePlain', () => {
  it('includes slug alongside the name', () => {
    const out = formatTreePlain(makeTree());
    expect(out.split('\n')[0]).toBe('Auth Service v2 (auth-service-v2)');
  });

  it('lists children with their status', () => {
    const tree = makeTree({
      children: [
        {
          name: 'Session A',
          slug: 'session-a',
          status: 'active',
          claude_session_name: 'X > Session A',
          created_at: '2026-04-16T10:00:00Z',
        },
      ],
    });
    const out = formatTreePlain(tree);
    expect(out).toContain('[active] Session A');
  });

  it('tags children with their worktree branch in plain output', () => {
    const tree = makeTree({
      children: [
        {
          name: 'Session A',
          slug: 'session-a',
          status: 'active',
          claude_session_name: 'X > Session A',
          created_at: '2026-04-16T10:00:00Z',
          worktree: {
            path: '/tmp/wt',
            branch: 'feature/a',
            base_ref: 'b'.repeat(40),
          },
        },
      ],
    });
    const out = formatTreePlain(tree);
    expect(out).toContain('[active] Session A [worktree: feature/a]');
  });
});
