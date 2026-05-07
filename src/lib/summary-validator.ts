import { parseSummarySections } from './summary-sections.js';

export class SummaryValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SummaryValidationError';
  }
}

export interface ValidationResult {
  warnings: string[];
}

const TEMPLATE = [
  '',
  'Expected schema (## TL;DR and ## Decisions are required; everything else is optional).',
  'Only TL;DR + Decisions + Artifacts are injected into the next sibling session.',
  'Open Questions / Next Steps / Details stay on disk and are read on demand via',
  'the get_sibling_context MCP tool.',
  '',
  '  ## TL;DR',
  '  <one short paragraph summarizing what this session accomplished>',
  '',
  '  ## Decisions',
  '  - <decision 1>',
  '  - <decision 2>',
  '  ... as many as you need; nothing is truncated',
  '',
  '  ## Artifacts',
  '  - path/to/file.ts',
  '',
  '  ## Open Questions      (optional, NOT injected)',
  '  ## Next Steps          (optional, NOT injected)',
  '  ## Details             (optional, NOT injected — verbose context lives here)',
].join('\n');

export function validateSummary(summary: string): ValidationResult {
  const sections = parseSummarySections(summary);
  const errors: string[] = [];
  const warnings: string[] = [];

  if (sections.tldr.trim().length === 0) {
    errors.push('Missing required section: ## TL;DR');
  }
  if (sections.decisions.length === 0) {
    errors.push('Missing required section: ## Decisions (at least one bullet)');
  }

  if (errors.length > 0) {
    const message =
      'Summary validation failed:\n' +
      errors.map((e) => `  - ${e}`).join('\n') +
      '\n' +
      TEMPLATE;
    throw new SummaryValidationError(message);
  }

  if (
    sections.artifactsCreated.length === 0 &&
    sections.details.length === 0 &&
    sections.openQuestions.length === 0 &&
    sections.nextSteps.length === 0
  ) {
    warnings.push(
      'Only TL;DR and Decisions were provided. Consider adding ## Artifacts ' +
        '(file paths touched) so future sibling sessions know where to look.',
    );
  }

  return { warnings };
}
