export function parseTagList(raw: string | undefined): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(',')) {
    const tag = normalizeTag(part);
    if (tag.length === 0) continue;
    if (!seen.has(tag)) {
      seen.add(tag);
      out.push(tag);
    }
  }
  return out;
}

export function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase().replace(/\s+/g, '-');
}

export function normalizeTags(tags: readonly string[] | undefined): string[] {
  if (!tags) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tags) {
    const norm = normalizeTag(t);
    if (norm.length === 0) continue;
    if (!seen.has(norm)) {
      seen.add(norm);
      out.push(norm);
    }
  }
  return out;
}

export function tagsMatch(
  childTags: readonly string[] | undefined,
  filter: string,
): boolean {
  const target = normalizeTag(filter);
  if (target.length === 0) return false;
  if (!childTags) return false;
  return childTags.some((t) => normalizeTag(t) === target);
}
