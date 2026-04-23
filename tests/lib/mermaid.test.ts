import { describe, it, expect } from 'vitest';
import { renderMermaid } from '../../src/lib/mermaid.js';
import type { TreeConfig, ChildSession } from '../../src/types/index.js';

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

describe('renderMermaid', () => {
  it('emits a minimal valid diagram when no trees exist', () => {
    const out = renderMermaid([]);
    expect(out).toMatch(/^graph TD\n/);
    expect(out).toContain('No trees yet');
  });

  it('renders a tree with no children', () => {
    const out = renderMermaid([makeTree({ name: 'Empty', slug: 'empty' })]);
    expect(out).toContain('graph TD');
    expect(out).toContain('empty[');
    expect(out).toContain('<b>Empty</b>');
    expect(out).toContain('no sessions yet');
    expect(out).not.toContain('-->');
  });

  it('renders children with the right status icons', () => {
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
    const out = renderMermaid([tree]);

    expect(out).toContain('auth --> auth__research["Research<br/>✓ Apr 15"]');
    expect(out).toContain('auth --> auth__api["API<br/>⚡ active"]');
    expect(out).toContain('auth --> auth__old["Old<br/>✗ abandoned"]');
  });

  it('applies classDef classes to tree and children by status', () => {
    const tree = makeTree({
      name: 'T',
      slug: 't',
      children: [
        makeChild({ slug: 'c1', status: 'committed', committed_at: '2026-04-15T18:00:00Z' }),
        makeChild({ slug: 'c2', status: 'active' }),
        makeChild({ slug: 'c3', status: 'abandoned' }),
      ],
    });
    const out = renderMermaid([tree]);

    expect(out).toContain('classDef tree ');
    expect(out).toContain('classDef committed ');
    expect(out).toContain('classDef active ');
    expect(out).toContain('classDef abandoned ');

    expect(out).toContain('class t tree');
    expect(out).toContain('class t__c1 committed');
    expect(out).toContain('class t__c2 active');
    expect(out).toContain('class t__c3 abandoned');
  });

  it('renders multiple trees in a single diagram', () => {
    const a = makeTree({ name: 'Auth', slug: 'auth' });
    const b = makeTree({ name: 'Payments', slug: 'payments' });
    const out = renderMermaid([a, b]);

    expect(out).toContain('auth[');
    expect(out).toContain('payments[');
    expect(out.indexOf('auth[')).toBeLessThan(out.indexOf('payments['));
  });

  it('converts hyphens in slugs to underscores in node IDs', () => {
    const tree = makeTree({
      slug: 'auth-service-v2',
      children: [makeChild({ slug: 'api-design', status: 'active' })],
    });
    const out = renderMermaid([tree]);

    expect(out).toContain('auth_service_v2[');
    expect(out).toContain('auth_service_v2 --> auth_service_v2__api_design[');
    expect(out).not.toMatch(/auth-service-v2\[/);
  });

  it('escapes HTML-unsafe characters in names', () => {
    const tree = makeTree({
      name: 'Fix <script> & "stuff"',
      slug: 'fix',
      children: [
        makeChild({ name: 'A & B > C', slug: 'a', status: 'active' }),
      ],
    });
    const out = renderMermaid([tree]);

    expect(out).toContain('&lt;script&gt;');
    expect(out).toContain('&amp;');
    expect(out).toContain('&quot;stuff&quot;');
    expect(out).toContain('A &amp; B &gt; C');
    expect(out).not.toMatch(/<script>/);
  });

  it('summarizes counts in the tree label', () => {
    const tree = makeTree({
      name: 'Auth',
      slug: 'auth',
      children: [
        makeChild({ slug: 'a', status: 'committed', committed_at: '2026-04-15T18:00:00Z' }),
        makeChild({ slug: 'b', status: 'committed', committed_at: '2026-04-16T18:00:00Z' }),
        makeChild({ slug: 'c', status: 'active' }),
        makeChild({ slug: 'd', status: 'abandoned' }),
      ],
    });
    const out = renderMermaid([tree]);
    expect(out).toContain('2 committed · 1 active · 1 abandoned');
  });

  it('honors the LR direction option', () => {
    const out = renderMermaid([makeTree()], { direction: 'LR' });
    expect(out).toMatch(/^graph LR\n/);
  });
});
