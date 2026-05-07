import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

const { TEST_DIR } = vi.hoisted(() => {
  const path = require('node:path');
  const os = require('node:os');
  const TEST_DIR = path.join(
    os.tmpdir(),
    `cctree-mermaid-arch-${Date.now()}-${Math.random().toString(36).slice(2)}`,
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

import type Anthropic from '@anthropic-ai/sdk';
import { readFile } from 'node:fs/promises';
import {
  renderArchitectureMermaid,
  ArchitectureMermaidError,
  __test__,
} from '../../src/lib/mermaid-architecture.js';
import {
  createTree,
  addChild,
  saveChildSummary,
  updateChildStatus,
  loadTree,
} from '../../src/lib/storage.js';

beforeEach(async () => {
  await mkdir(TEST_DIR, { recursive: true });
});

afterEach(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
});

describe('stripFences', () => {
  const { stripFences } = __test__;

  it('removes ```mermaid fences', () => {
    expect(stripFences('```mermaid\ngraph TD\nA --> B\n```')).toBe(
      'graph TD\nA --> B',
    );
  });

  it('removes plain ``` fences', () => {
    expect(stripFences('```\ngraph TD\nA --> B\n```')).toBe('graph TD\nA --> B');
  });

  it('passes through unfenced content', () => {
    expect(stripFences('graph TD\nA --> B')).toBe('graph TD\nA --> B');
  });

  it('trims surrounding whitespace', () => {
    expect(stripFences('   \n\ngraph TD\nA --> B\n\n  ')).toBe(
      'graph TD\nA --> B',
    );
  });
});

describe('VALID_HEADER', () => {
  const { VALID_HEADER } = __test__;

  it.each([
    'graph TD',
    'graph LR',
    'flowchart TD',
    'flowchart LR',
    'sequenceDiagram',
    'stateDiagram',
    'stateDiagram-v2',
    'classDiagram',
    'erDiagram',
  ])('accepts %s', (header) => {
    expect(VALID_HEADER.test(`${header}\nA --> B`)).toBe(true);
  });

  it.each([
    'random text',
    'Here is the diagram:\ngraph TD',
    '```mermaid\ngraph TD',
    '',
  ])('rejects %s', (input) => {
    expect(VALID_HEADER.test(input)).toBe(false);
  });
});

describe('buildUserMessage', () => {
  const { buildUserMessage } = __test__;

  it('serializes tree + sessions as JSON', () => {
    const tree = {
      name: 'MCP Release',
      slug: 'mcp-release',
      created_at: '2026-04-01T00:00:00Z',
      cwd: '/tmp',
      initial_context_files: [],
      children: [],
    };
    const sessions = [
      {
        name: 'Research',
        slug: 'research',
        tldr: 'Investigated transports.',
        decisions: ['Use stdio'],
        artifacts: ['src/server.ts'],
        committed_at: '2026-04-01T01:00:00Z',
      },
    ];
    const out = buildUserMessage(tree, sessions);
    const parsed = JSON.parse(out);
    expect(parsed.tree_name).toBe('MCP Release');
    expect(parsed.tree_slug).toBe('mcp-release');
    expect(parsed.sessions).toHaveLength(1);
    expect(parsed.sessions[0].decisions).toEqual(['Use stdio']);
  });
});

describe('renderArchitectureMermaid', () => {
  it('throws when no API key is set and no client is provided', async () => {
    const original = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      await createTree('NoKey', TEST_DIR, []);
      const tree = await loadTree('nokey');
      await expect(
        renderArchitectureMermaid(tree, new Map()),
      ).rejects.toThrow(/ANTHROPIC_API_KEY/);
    } finally {
      if (original !== undefined) process.env.ANTHROPIC_API_KEY = original;
    }
  });

  it('throws when there are no committed sessions to derive from', async () => {
    await createTree('Empty', TEST_DIR, []);
    const tree = await loadTree('empty');
    const fakeClient = makeFakeClient('graph TD\nA --> B');
    await expect(
      renderArchitectureMermaid(tree, new Map(), {
        client: fakeClient as unknown as Anthropic,
      }),
    ).rejects.toThrow(/no committed sessions/);
  });

  it('calls the client with parsed sessions and returns the diagram', async () => {
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
        '## Details',
        'Verbose stuff that should NOT be sent to the LLM.',
      ].join('\n'),
    );
    await updateChildStatus(
      'arch-test',
      'research',
      'committed',
      '2026-04-15T11:00:00Z',
    );

    const tree = await loadTree('arch-test');
    const summaryRaw = await readFile(
      join(TEST_DIR, 'trees', 'arch-test', 'children', 'research.md'),
      'utf-8',
    );
    const summaries = new Map<string, string>([['research', summaryRaw]]);

    const fakeClient = makeFakeClient(
      '```mermaid\nflowchart TD\n  Decision[Use stdio] --> Artifact[src/server.ts]\n```',
    );

    const result = await renderArchitectureMermaid(tree, summaries, {
      client: fakeClient as unknown as Anthropic,
    });

    expect(result.diagram).toMatch(/^flowchart TD/);
    expect(result.diagram).toContain('Use stdio');
    expect(result.diagram).not.toContain('```');

    // The user message should carry only injectable layers, not Details.
    const callArg = fakeClient.lastCallArgs;
    const userContent = callArg?.messages[0].content as string;
    expect(userContent).toContain('Use stdio over SSE');
    expect(userContent).toContain('src/server.ts');
    expect(userContent).not.toContain('Verbose stuff');

    // Prompt caching is configured on the system block.
    expect(callArg?.system[0].cache_control).toEqual({ type: 'ephemeral' });
  });

  it('throws ArchitectureMermaidError when model returns invalid header', async () => {
    await createTree('Bad', TEST_DIR, []);
    await addChild('bad', {
      name: 'A',
      slug: 'a',
      status: 'active',
      claude_session_name: 'Bad > A',
      created_at: '2026-04-15T10:00:00Z',
    });
    await saveChildSummary(
      'bad',
      'a',
      '## TL;DR\nx\n\n## Decisions\n- y',
    );
    await updateChildStatus('bad', 'a', 'committed', '2026-04-15T11:00:00Z');

    const tree = await loadTree('bad');
    const summaries = new Map<string, string>([
      ['a', '## TL;DR\nx\n\n## Decisions\n- y'],
    ]);
    const fakeClient = makeFakeClient(
      'Sure! Here is your diagram:\n\nIt represents...',
    );

    await expect(
      renderArchitectureMermaid(tree, summaries, {
        client: fakeClient as unknown as Anthropic,
      }),
    ).rejects.toThrow(ArchitectureMermaidError);
  });
});

interface FakeClient {
  messages: { create: (args: any) => Promise<any> };
  lastCallArgs: any;
}

function makeFakeClient(responseText: string): FakeClient {
  const fake: FakeClient = {
    messages: {
      create: async (args: any) => {
        fake.lastCallArgs = args;
        return {
          model: 'claude-sonnet-4-6',
          content: [{ type: 'text', text: responseText }],
          usage: {
            input_tokens: 100,
            output_tokens: 50,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
          },
        };
      },
    },
    lastCallArgs: null,
  };
  return fake;
}
