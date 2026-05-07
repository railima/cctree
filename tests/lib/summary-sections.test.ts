import { describe, it, expect } from 'vitest';
import {
  parseSummarySections,
  renderInjectableMarkdown,
} from '../../src/lib/summary-sections.js';

describe('parseSummarySections', () => {
  it('parses the canonical four sections', () => {
    const md = `## Decisions
- Chose PostgreSQL over MongoDB for ACID compliance
- REST API with versioned endpoints

## Artifacts Created
- Migration file: db/migrate/001_create_users.rb
- API controller: app/controllers/users_controller.rb

## Open Questions
- Should we version event schemas?

## Next Steps
- Wire up the webhook handler in the next session`;

    const out = parseSummarySections(md);
    expect(out.decisions).toEqual([
      'Chose PostgreSQL over MongoDB for ACID compliance',
      'REST API with versioned endpoints',
    ]);
    expect(out.artifactsCreated).toEqual([
      'Migration file: db/migrate/001_create_users.rb',
      'API controller: app/controllers/users_controller.rb',
    ]);
    expect(out.openQuestions).toEqual(['Should we version event schemas?']);
    expect(out.nextSteps).toEqual(['Wire up the webhook handler in the next session']);
  });

  it('returns empty arrays for missing sections', () => {
    const md = `## Decisions
- Only this one matters`;
    const out = parseSummarySections(md);
    expect(out.decisions).toEqual(['Only this one matters']);
    expect(out.artifactsCreated).toEqual([]);
    expect(out.openQuestions).toEqual([]);
    expect(out.nextSteps).toEqual([]);
  });

  it('supports Portuguese section headers', () => {
    const md = `## Decisões
- Escolhemos PostgreSQL

## Artefatos Criados
- db/migrate/001.rb

## Perguntas Abertas
- Precisa versionar?

## Próximos Passos
- Ligar no webhook`;

    const out = parseSummarySections(md);
    expect(out.decisions).toEqual(['Escolhemos PostgreSQL']);
    expect(out.artifactsCreated).toEqual(['db/migrate/001.rb']);
    expect(out.openQuestions).toEqual(['Precisa versionar?']);
    expect(out.nextSteps).toEqual(['Ligar no webhook']);
  });

  it('is case-insensitive on headers', () => {
    const md = `## decisions
- a

## ARTIFACTS CREATED
- b`;
    const out = parseSummarySections(md);
    expect(out.decisions).toEqual(['a']);
    expect(out.artifactsCreated).toEqual(['b']);
  });

  it('handles both - and * bullet markers', () => {
    const md = `## Decisions
- dash bullet
* star bullet`;
    const out = parseSummarySections(md);
    expect(out.decisions).toEqual(['dash bullet', 'star bullet']);
  });

  it('joins wrapped bullet text into a single entry', () => {
    const md = `## Decisions
- This decision is explained
  across multiple lines
  for readability`;
    const out = parseSummarySections(md);
    expect(out.decisions).toEqual([
      'This decision is explained across multiple lines for readability',
    ]);
  });

  it('ignores content outside of known sections', () => {
    const md = `Some preamble text.

## Random Other Section
- should not appear

## Decisions
- should appear

## Another Unknown
- should not appear`;
    const out = parseSummarySections(md);
    expect(out.decisions).toEqual(['should appear']);
    expect(out.artifactsCreated).toEqual([]);
  });

  it('blank line between bullets ends the prior bullet cleanly', () => {
    const md = `## Decisions
- first decision

- second decision`;
    const out = parseSummarySections(md);
    expect(out.decisions).toEqual(['first decision', 'second decision']);
  });

  it('accepts shorter aliases for artifact headers', () => {
    const md = `## Artifacts
- thing one
- thing two`;
    const out = parseSummarySections(md);
    expect(out.artifactsCreated).toEqual(['thing one', 'thing two']);
  });

  it('returns empty sections for an empty summary', () => {
    const out = parseSummarySections('');
    expect(out).toEqual({
      tldr: '',
      decisions: [],
      artifactsCreated: [],
      openQuestions: [],
      nextSteps: [],
      details: '',
    });
  });

  it('parses ## TL;DR as free text (single paragraph)', () => {
    const md = `## TL;DR
Investigated MCP stdio vs SSE transport.

## Decisions
- Use stdio`;
    const out = parseSummarySections(md);
    expect(out.tldr).toBe('Investigated MCP stdio vs SSE transport.');
    expect(out.decisions).toEqual(['Use stdio']);
  });

  it('parses ## Details as free text preserving line breaks', () => {
    const md = `## TL;DR
Short.

## Decisions
- A

## Details
Long notes go here.
They span multiple lines.

Even with blank lines between paragraphs.`;
    const out = parseSummarySections(md);
    expect(out.details).toContain('Long notes go here.');
    expect(out.details).toContain('They span multiple lines.');
    expect(out.details).toContain('Even with blank lines between paragraphs.');
  });

  it('accepts Portuguese aliases for TL;DR and Details', () => {
    const md = `## Resumo
Resumo curto.

## Decisions
- d

## Detalhes
Notas longas.`;
    const out = parseSummarySections(md);
    expect(out.tldr).toBe('Resumo curto.');
    expect(out.details).toBe('Notas longas.');
  });
});

describe('renderInjectableMarkdown', () => {
  it('renders only TL;DR + Decisions + Artifacts', () => {
    const out = renderInjectableMarkdown({
      tldr: 'A short summary.',
      decisions: ['Use TS', 'Vendor SDK X'],
      artifactsCreated: ['src/foo.ts', 'src/bar.ts'],
      openQuestions: ['unused?'],
      nextSteps: ['unused?'],
      details: 'verbose notes',
    });
    expect(out).toContain('## TL;DR');
    expect(out).toContain('A short summary.');
    expect(out).toContain('## Decisions');
    expect(out).toContain('- Use TS');
    expect(out).toContain('## Artifacts');
    expect(out).toContain('- src/foo.ts');
    expect(out).not.toContain('## Open Questions');
    expect(out).not.toContain('## Next Steps');
    expect(out).not.toContain('## Details');
    expect(out).not.toContain('verbose notes');
  });

  it('skips empty layers', () => {
    const out = renderInjectableMarkdown({
      tldr: 'Only a tldr.',
      decisions: [],
      artifactsCreated: [],
      openQuestions: [],
      nextSteps: [],
      details: '',
    });
    expect(out).toBe('## TL;DR\nOnly a tldr.');
  });

  it('returns empty string when nothing is injectable', () => {
    const out = renderInjectableMarkdown({
      tldr: '',
      decisions: [],
      artifactsCreated: [],
      openQuestions: ['only questions'],
      nextSteps: [],
      details: 'only details',
    });
    expect(out).toBe('');
  });
});
