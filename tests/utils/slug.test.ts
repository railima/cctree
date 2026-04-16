import { describe, it, expect } from 'vitest';
import { toSlug } from '../../src/utils/slug.js';

describe('toSlug', () => {
  it('converts spaces to hyphens', () => {
    expect(toSlug('Architecture Decisions')).toBe('architecture-decisions');
  });

  it('lowercases the input', () => {
    expect(toSlug('MCP Release')).toBe('mcp-release');
  });

  it('removes special characters', () => {
    expect(toSlug('Feature: Auth & SSO!')).toBe('feature-auth-sso');
  });

  it('collapses multiple hyphens', () => {
    expect(toSlug('hello---world')).toBe('hello-world');
  });

  it('trims leading and trailing hyphens', () => {
    expect(toSlug('--test--')).toBe('test');
  });

  it('handles empty string', () => {
    expect(toSlug('')).toBe('');
  });

  it('handles multiple spaces', () => {
    expect(toSlug('my   great   project')).toBe('my-great-project');
  });

  it('handles already slugified input', () => {
    expect(toSlug('already-a-slug')).toBe('already-a-slug');
  });
});
