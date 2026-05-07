import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { initialContextDir, childrenDir, contextPath } from './config.js';
import { loadTree } from './storage.js';
import { CONTEXT_HOOK_MAX_CHARS } from './config.js';
import {
  parseSummarySections,
  renderInjectableMarkdown,
} from './summary-sections.js';

function injectableFromSummary(raw: string): string {
  const parsed = parseSummarySections(raw);
  const rendered = renderInjectableMarkdown(parsed);
  // Legacy summaries may not match any known section header; in that case
  // fall back to the verbatim content so we don't silently lose context.
  return rendered.length > 0 ? rendered : raw.trim();
}

export async function rebuildContext(treeSlug: string): Promise<string> {
  const config = await loadTree(treeSlug).catch(() => null);

  const sections: string[] = [];

  sections.push(`# Context: ${config?.name ?? treeSlug}`);
  sections.push('');

  const initialDir = initialContextDir(treeSlug);
  try {
    const files = await readdir(initialDir);
    if (files.length > 0) {
      sections.push('## Initial Context');
      sections.push('');

      for (const file of files.sort()) {
        const content = await readFile(join(initialDir, file), 'utf-8');
        sections.push(`### ${file}`);
        sections.push('');
        sections.push(content.trim());
        sections.push('');
      }
    }
  } catch {
    // no initial context dir
  }

  if (config?.children) {
    const committed = config.children
      .filter((c) => c.status === 'committed' && c.committed_at)
      .sort((a, b) => (a.committed_at ?? '').localeCompare(b.committed_at ?? ''));

    for (const child of committed) {
      try {
        const summaryPath = join(childrenDir(treeSlug), `${child.slug}.md`);
        const content = await readFile(summaryPath, 'utf-8');
        const injectable = injectableFromSummary(content);
        if (injectable.length === 0) continue;

        const date = child.committed_at
          ? new Date(child.committed_at).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })
          : '';

        sections.push(`## Session: ${child.name}${date ? ` (${date})` : ''}`);
        sections.push('');
        sections.push(injectable);
        sections.push('');
      } catch {
        // skip children without summaries
      }
    }
  }

  const contextContent = sections.join('\n').trim() + '\n';
  await writeFile(contextPath(treeSlug), contextContent);

  return contextContent;
}

export function truncateForHook(content: string, maxChars: number = CONTEXT_HOOK_MAX_CHARS): string {
  if (content.length <= maxChars) {
    return content;
  }

  const suffix = '\n\n[truncated, full context available via cctree MCP tools]';
  return content.slice(0, maxChars - suffix.length) + suffix;
}
