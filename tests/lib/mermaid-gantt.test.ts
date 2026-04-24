import { describe, it, expect } from 'vitest';
import { renderMermaidGantt } from '../../src/lib/mermaid-gantt.js';
import type { ChildSession, TreeConfig } from '../../src/types/index.js';

function makeChild(overrides: Partial<ChildSession> = {}): ChildSession {
  return {
    name: 'Child',
    slug: 'child',
    status: 'active',
    claude_session_name: 'T > Child',
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

describe('renderMermaidGantt', () => {
  it('renders the gantt header and tree section', () => {
    const tree = makeTree({ name: 'Auth', slug: 'auth' });
    const out = renderMermaidGantt(tree, [], { now: new Date('2026-04-20T12:00:00Z') });
    expect(out).toMatch(/^gantt\n/);
    expect(out).toContain('dateFormat YYYY-MM-DD');
    expect(out).toContain('axisFormat %b %d');
    expect(out).toContain('section Auth');
    expect(out).toContain('(no sessions to show)');
  });

  it('renders committed children with a done tag and the committed date as end', () => {
    const tree = makeTree();
    const child = makeChild({
      name: 'Research',
      status: 'committed',
      created_at: '2026-04-14T10:00:00Z',
      committed_at: '2026-04-16T18:00:00Z',
    });
    const out = renderMermaidGantt(tree, [child], { now: new Date('2026-04-20T12:00:00Z') });
    expect(out).toContain('Research :done, 2026-04-14, 2026-04-16');
  });

  it('renders active children with an active tag and today as end', () => {
    const tree = makeTree();
    const child = makeChild({
      name: 'API',
      status: 'active',
      created_at: '2026-04-15T10:00:00Z',
    });
    const out = renderMermaidGantt(tree, [child], { now: new Date('2026-04-20T12:00:00Z') });
    expect(out).toContain('API :active, 2026-04-15, 2026-04-20');
  });

  it('renders abandoned children with no status tag (neutral bar)', () => {
    const tree = makeTree();
    const child = makeChild({
      name: 'Old Approach',
      status: 'abandoned',
      created_at: '2026-04-13T10:00:00Z',
    });
    const out = renderMermaidGantt(tree, [child], { now: new Date('2026-04-20T12:00:00Z') });
    expect(out).toContain('Old Approach :2026-04-13, 2026-04-14');
    expect(out).not.toContain('Old Approach :crit');
  });

  it('bumps same-day committed bars to a 1-day span (mermaid rejects zero width)', () => {
    const tree = makeTree();
    const child = makeChild({
      name: 'Quick fix',
      status: 'committed',
      created_at: '2026-04-15T09:00:00Z',
      committed_at: '2026-04-15T18:00:00Z',
    });
    const out = renderMermaidGantt(tree, [child], { now: new Date('2026-04-20T12:00:00Z') });
    expect(out).toContain('Quick fix :done, 2026-04-15, 2026-04-16');
  });

  it('sanitizes colons in task names to prevent breaking the gantt parser', () => {
    const tree = makeTree({ name: 'Auth: v2' });
    const child = makeChild({
      name: 'Research: main flow',
      status: 'committed',
      created_at: '2026-04-14T10:00:00Z',
      committed_at: '2026-04-16T18:00:00Z',
    });
    const out = renderMermaidGantt(tree, [child]);
    expect(out).toContain('section Auth — v2');
    expect(out).toContain('Research — main flow :done,');
  });

  it('accepts a custom title via options', () => {
    const tree = makeTree({ name: 'Tree' });
    const out = renderMermaidGantt(tree, [], { title: 'Sprint 42 · Rai Lima' });
    expect(out).toContain('title Sprint 42 · Rai Lima');
  });
});
