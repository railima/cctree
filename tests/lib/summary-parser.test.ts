import { describe, it, expect } from 'vitest';
import { extractFilePaths } from '../../src/lib/summary-parser.js';

describe('extractFilePaths', () => {
  it('returns an empty array when no paths are present', () => {
    expect(extractFilePaths('Just a summary with no code references.')).toEqual([]);
  });

  it('finds a simple relative path in a bullet', () => {
    const md = `## Artifacts
- src/middleware/auth.ts — new middleware
- db/migrate/001_create_users.rb`;
    expect(extractFilePaths(md)).toEqual([
      'src/middleware/auth.ts',
      'db/migrate/001_create_users.rb',
    ]);
  });

  it('finds paths quoted with backticks or quotes', () => {
    const md = 'We updated `src/events/publisher.ts` and "docs/adr/001.md".';
    expect(extractFilePaths(md)).toEqual([
      'src/events/publisher.ts',
      'docs/adr/001.md',
    ]);
  });

  it('ignores bare filenames with no directory separator', () => {
    const md = 'Reviewed config.ts and package.json — nothing else.';
    expect(extractFilePaths(md)).toEqual([]);
  });

  it('ignores extensions not in the allowlist', () => {
    const md = 'See assets/logo.png and docs/guide.pdf.';
    expect(extractFilePaths(md)).toEqual([]);
  });

  it('deduplicates paths that appear multiple times', () => {
    const md = `- src/auth.ts created
- Updated src/auth.ts again
- src/auth.ts tested`;
    expect(extractFilePaths(md)).toEqual(['src/auth.ts']);
  });

  it('preserves order of first appearance', () => {
    const md = `first src/b.ts
then src/a.ts
again src/b.ts`;
    expect(extractFilePaths(md)).toEqual(['src/b.ts', 'src/a.ts']);
  });

  it('matches paths at the start of a line', () => {
    const md = 'src/index.ts is the entry point.';
    expect(extractFilePaths(md)).toEqual(['src/index.ts']);
  });

  it('does not capture trailing punctuation', () => {
    const md = 'Look at src/auth.ts, then src/user.ts.';
    expect(extractFilePaths(md)).toEqual(['src/auth.ts', 'src/user.ts']);
  });

  it('handles nested paths with multiple segments', () => {
    const md = 'See app/models/concerns/auth/token.rb';
    expect(extractFilePaths(md)).toEqual(['app/models/concerns/auth/token.rb']);
  });

  it('supports multiple file extensions from the curated set', () => {
    const md = `
- src/foo.tsx
- src/bar.py
- src/baz.go
- src/qux.rs
- src/quux.swift
- src/corge.kt
- config/infra.toml
- scripts/deploy.sh
`;
    expect(extractFilePaths(md)).toEqual([
      'src/foo.tsx',
      'src/bar.py',
      'src/baz.go',
      'src/qux.rs',
      'src/quux.swift',
      'src/corge.kt',
      'config/infra.toml',
      'scripts/deploy.sh',
    ]);
  });
});
