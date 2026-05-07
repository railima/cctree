import { describe, it, expect } from 'vitest';
import {
  validateSummary,
  SummaryValidationError,
} from '../../src/lib/summary-validator.js';

describe('validateSummary', () => {
  it('passes cleanly with TL;DR + Decisions + Artifacts', () => {
    const summary =
      '## TL;DR\nDid the thing.\n\n## Decisions\n- Choice A\n\n## Artifacts\n- src/foo.ts';
    const result = validateSummary(summary);
    expect(result.warnings).toEqual([]);
  });

  it('throws when ## TL;DR is missing', () => {
    expect(() => validateSummary('## Decisions\n- Only this')).toThrow(
      SummaryValidationError,
    );
    expect(() => validateSummary('## Decisions\n- Only this')).toThrow(
      /TL;DR/,
    );
  });

  it('throws when ## Decisions is missing or empty', () => {
    expect(() => validateSummary('## TL;DR\nJust a tldr.')).toThrow(
      /Decisions/,
    );
    expect(() => validateSummary('## TL;DR\nx\n\n## Decisions\n')).toThrow(
      /Decisions/,
    );
  });

  it('does not truncate, does not enforce bullet count', () => {
    const manyBullets = Array.from({ length: 50 }, (_, i) => `- decision ${i}`).join(
      '\n',
    );
    const summary = `## TL;DR\nLots of decisions.\n\n## Decisions\n${manyBullets}\n\n## Artifacts\n- src/foo.ts`;
    expect(() => validateSummary(summary)).not.toThrow();
    const result = validateSummary(summary);
    expect(result.warnings).toEqual([]);
  });

  it('warns when only TL;DR + Decisions are present (no other sections)', () => {
    const result = validateSummary(
      '## TL;DR\nMinimal.\n\n## Decisions\n- one decision',
    );
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toMatch(/Artifacts/);
  });

  it('does NOT warn when Artifacts is present', () => {
    const summary =
      '## TL;DR\nx\n\n## Decisions\n- y\n\n## Artifacts\n- src/foo.ts';
    const result = validateSummary(summary);
    expect(result.warnings).toEqual([]);
  });

  it('error message includes the expected schema template', () => {
    try {
      validateSummary('no sections at all');
      expect.fail('should have thrown');
    } catch (err) {
      const message = (err as Error).message;
      expect(message).toContain('## TL;DR');
      expect(message).toContain('## Decisions');
      expect(message).toContain('## Artifacts');
      expect(message).toContain('## Details');
    }
  });
});
