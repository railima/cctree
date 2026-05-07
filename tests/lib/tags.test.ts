import { describe, it, expect } from 'vitest';
import {
  parseTagList,
  normalizeTag,
  normalizeTags,
  tagsMatch,
} from '../../src/lib/tags.js';

describe('parseTagList', () => {
  it('returns [] for undefined or empty', () => {
    expect(parseTagList(undefined)).toEqual([]);
    expect(parseTagList('')).toEqual([]);
    expect(parseTagList(',  ,')).toEqual([]);
  });

  it('splits on commas and trims', () => {
    expect(parseTagList('foo, bar,baz')).toEqual(['foo', 'bar', 'baz']);
  });

  it('lowercases and slugifies whitespace inside a tag', () => {
    expect(parseTagList('Sprint 2, Bug Fix')).toEqual(['sprint-2', 'bug-fix']);
  });

  it('deduplicates after normalization', () => {
    expect(parseTagList('Bug, bug, BUG')).toEqual(['bug']);
  });
});

describe('normalizeTag', () => {
  it('lowercases and replaces whitespace with -', () => {
    expect(normalizeTag('  Sprint 2  ')).toBe('sprint-2');
  });
});

describe('normalizeTags', () => {
  it('returns [] for undefined', () => {
    expect(normalizeTags(undefined)).toEqual([]);
  });

  it('preserves order on first occurrence', () => {
    expect(normalizeTags(['B', 'a', 'b', 'A'])).toEqual(['b', 'a']);
  });
});

describe('tagsMatch', () => {
  it('matches case-insensitively', () => {
    expect(tagsMatch(['ticket-1234', 'bug'], 'BUG')).toBe(true);
  });

  it('returns false when child has no tags', () => {
    expect(tagsMatch(undefined, 'bug')).toBe(false);
    expect(tagsMatch([], 'bug')).toBe(false);
  });

  it('returns false on partial-only matches', () => {
    expect(tagsMatch(['ticket-1234'], 'ticket')).toBe(false);
  });
});
