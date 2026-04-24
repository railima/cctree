import { describe, it, expect } from 'vitest';
import { renderReport } from '../../src/lib/report.js';
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

describe('renderReport', () => {
  it('renders the header with author, tree, scope, and breakdown', () => {
    const tree = makeTree({
      name: 'Auth Service v2',
      slug: 'auth-service-v2',
      children: [
        makeChild({ slug: 'a', status: 'committed', committed_at: '2026-04-15T18:00:00Z' }),
        makeChild({ slug: 'b', status: 'active' }),
        makeChild({ slug: 'c', status: 'abandoned' }),
      ],
    });
    const out = renderReport({
      tree,
      includedChildren: tree.children,
      summaries: new Map(),
      author: 'Rai Lima',
      generatedAt: new Date('2026-04-20T12:00:00Z'),
    });

    expect(out).toContain('author: "Rai Lima"');
    expect(out).toContain('# Auth Service v2 — progress report');
    expect(out).toContain('**Author**: Rai Lima');
    expect(out).toContain('**Tree**: `auth-service-v2`');
    expect(out).toContain('**Scope**: all sessions');
    expect(out).toContain('1 delivered · 1 in progress · 1 parked');
  });

  it('reports partial scope when children are filtered', () => {
    const tree = makeTree({
      children: [
        makeChild({ slug: 'a', status: 'committed', committed_at: '2026-04-15T18:00:00Z' }),
        makeChild({ slug: 'b', status: 'committed', committed_at: '2026-04-16T18:00:00Z' }),
        makeChild({ slug: 'c', status: 'active' }),
      ],
    });
    const out = renderReport({
      tree,
      includedChildren: [tree.children[0]],
      summaries: new Map(),
      author: 'Rai',
      generatedAt: new Date('2026-04-20T12:00:00Z'),
    });
    expect(out).toContain('**Scope**: 1 of 3 sessions');
    expect(out).toContain('scope: "1 of 3 sessions"');
  });

  it('aggregates Decisions, Open questions, and Artifacts per child', () => {
    const tree = makeTree({
      children: [
        makeChild({
          name: 'Research',
          slug: 'research',
          status: 'committed',
          committed_at: '2026-04-15T18:00:00Z',
        }),
        makeChild({
          name: 'Impl',
          slug: 'impl',
          status: 'committed',
          committed_at: '2026-04-17T18:00:00Z',
        }),
      ],
    });
    const summaries = new Map<string, string>([
      [
        'research',
        `## Decisions
- Chose microservices

## Artifacts Created
- docs/arch.md

## Open Questions
- Versioning?`,
      ],
      [
        'impl',
        `## Decisions
- Use JWT with refresh

## Artifacts Created
- src/auth.ts`,
      ],
    ]);
    const out = renderReport({
      tree,
      includedChildren: tree.children,
      summaries,
      author: 'Rai',
      generatedAt: new Date('2026-04-20T12:00:00Z'),
    });

    expect(out).toContain('## Decisions');
    expect(out).toContain('### From _Research_');
    expect(out).toContain('- Chose microservices');
    expect(out).toContain('### From _Impl_');
    expect(out).toContain('- Use JWT with refresh');

    expect(out).toContain('## Open questions');
    expect(out).toContain('- Versioning?');

    expect(out).toContain('## Artifacts delivered');
    expect(out).toContain('- docs/arch.md');
    expect(out).toContain('- src/auth.ts');
  });

  it('shows empty-state messages for sections with no content', () => {
    const tree = makeTree({
      children: [makeChild({ slug: 'a', status: 'committed', committed_at: '2026-04-15T18:00:00Z' })],
    });
    const summaries = new Map([['a', '## Decisions\n- Only a decision here.']]);
    const out = renderReport({
      tree,
      includedChildren: tree.children,
      summaries,
      author: 'Rai',
      generatedAt: new Date('2026-04-20T12:00:00Z'),
    });
    expect(out).toContain('No open questions recorded');
    expect(out).toContain('No artifacts recorded');
  });

  it('ranks hot files by number of sessions that mention them', () => {
    const tree = makeTree({
      children: [
        makeChild({ slug: 'a', name: 'A', status: 'committed', committed_at: '2026-04-15T18:00:00Z' }),
        makeChild({ slug: 'b', name: 'B', status: 'committed', committed_at: '2026-04-16T18:00:00Z' }),
        makeChild({ slug: 'c', name: 'C', status: 'committed', committed_at: '2026-04-17T18:00:00Z' }),
      ],
    });
    const summaries = new Map([
      ['a', '- src/shared.ts\n- src/only-a.ts'],
      ['b', '- src/shared.ts\n- src/only-b.ts'],
      ['c', '- src/shared.ts'],
    ]);
    // we need the paths to be inside a known section — wrap under ## Artifacts Created
    const wrapped = new Map(
      Array.from(summaries.entries()).map(([k, v]) => [k, `## Artifacts Created\n${v}`]),
    );

    const out = renderReport({
      tree,
      includedChildren: tree.children,
      summaries: wrapped,
      author: 'Rai',
      generatedAt: new Date('2026-04-20T12:00:00Z'),
    });

    const hotSection = out.slice(out.indexOf('## Hot files'));
    // shared.ts should come first with count 3
    expect(hotSection).toMatch(/src\/shared\.ts`.*\|\s*3 —/);
    // only-a and only-b show 1 each
    expect(hotSection).toMatch(/src\/only-a\.ts`.*\|\s*1 —/);
    expect(hotSection).toMatch(/src\/only-b\.ts`.*\|\s*1 —/);
    // ordering: shared.ts line appears before only-a/only-b
    expect(hotSection.indexOf('src/shared.ts')).toBeLessThan(hotSection.indexOf('src/only-a.ts'));
  });

  it('embeds a timeline gantt and a structure diagram in mermaid blocks', () => {
    const tree = makeTree({
      children: [
        makeChild({ slug: 'a', status: 'committed', committed_at: '2026-04-15T18:00:00Z' }),
      ],
    });
    const out = renderReport({
      tree,
      includedChildren: tree.children,
      summaries: new Map([['a', '']]),
      author: 'Rai',
      generatedAt: new Date('2026-04-20T12:00:00Z'),
    });

    expect(out).toContain('## Timeline');
    expect(out).toMatch(/```mermaid\ngantt/);
    expect(out).toContain('## Structure');
    expect(out).toMatch(/```mermaid\ngraph TD/);
  });

  it('uses neutral "Explored (parked)" framing for abandoned children', () => {
    const tree = makeTree({
      children: [makeChild({ slug: 'a', name: 'Old', status: 'abandoned' })],
    });
    const out = renderReport({
      tree,
      includedChildren: tree.children,
      summaries: new Map(),
      author: 'Rai',
      generatedAt: new Date('2026-04-20T12:00:00Z'),
    });
    expect(out).toContain('### Explored (parked)');
    expect(out).toContain('- **Old**');
    expect(out).toContain('conscious decision not to follow a direction');
    expect(out).not.toContain('abandoned · ✗');
  });

  it('renders a graceful empty-state when no sessions are selected', () => {
    const tree = makeTree({ children: [] });
    const out = renderReport({
      tree,
      includedChildren: [],
      summaries: new Map(),
      author: 'Rai',
      generatedAt: new Date('2026-04-20T12:00:00Z'),
    });
    expect(out).toContain('_No sessions match the requested filter._');
    expect(out).not.toContain('## Decisions');
  });

  it('includes session detail with verbatim summary in collapsible sections', () => {
    const tree = makeTree({
      children: [
        makeChild({ slug: 'a', name: 'A', status: 'committed', committed_at: '2026-04-15T18:00:00Z' }),
      ],
    });
    const summary = '## Decisions\n- x';
    const out = renderReport({
      tree,
      includedChildren: tree.children,
      summaries: new Map([['a', summary]]),
      author: 'Rai',
      generatedAt: new Date('2026-04-20T12:00:00Z'),
    });
    expect(out).toContain('<details>');
    expect(out).toContain('<strong>A</strong>');
    expect(out).toContain('committed 2026-04-15');
    expect(out).toContain(summary);
  });
});
