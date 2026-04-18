import { mkdir, readFile, writeFile, readdir, cp, access } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import {
  paths,
  treePath,
  treeJsonPath,
  initialContextDir,
  childrenDir,
  childSummaryPath,
} from './config.js';
import { toSlug } from '../utils/slug.js';
import { rebuildContext } from './context-builder.js';
import type { TreeConfig, ChildSession, ActiveSession } from '../types/index.js';

async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true, mode: 0o700 });
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function assertValidSlug(slug: string, label: string): void {
  if (!slug || !/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    throw new Error(
      `Invalid ${label}: "${slug}". Must contain at least one alphanumeric character.`,
    );
  }
}

export async function createTree(
  name: string,
  cwd: string,
  contextFiles: string[],
): Promise<TreeConfig> {
  const slug = toSlug(name);
  assertValidSlug(slug, 'tree name');
  const root = treePath(slug);

  if (await fileExists(treeJsonPath(slug))) {
    throw new Error(`Tree "${name}" already exists.`);
  }

  await ensureDir(root);
  await ensureDir(initialContextDir(slug));
  await ensureDir(childrenDir(slug));

  const copiedFiles: string[] = [];
  for (const file of contextFiles) {
    const absPath = resolve(cwd, file);
    const resolvedCwd = resolve(cwd);
    if (!absPath.startsWith(resolvedCwd + '/') && absPath !== resolvedCwd) {
      throw new Error(
        `Context file "${file}" resolves outside the working directory. Use files within your project.`,
      );
    }
    const fileName = basename(absPath);
    const dest = resolve(initialContextDir(slug), fileName);
    await cp(absPath, dest);
    copiedFiles.push(fileName);
  }

  const config: TreeConfig = {
    name,
    slug,
    created_at: new Date().toISOString(),
    cwd,
    initial_context_files: copiedFiles,
    children: [],
  };

  await writeFile(treeJsonPath(slug), JSON.stringify(config, null, 2));
  await rebuildContext(slug);
  await setActiveTree(slug);

  return config;
}

export async function addContextFiles(
  treeSlug: string,
  cwd: string,
  files: string[],
): Promise<{ added: string[]; tree: TreeConfig }> {
  const config = await loadTree(treeSlug);

  await ensureDir(initialContextDir(treeSlug));

  const resolvedCwd = resolve(cwd);
  const added: string[] = [];

  for (const file of files) {
    const absPath = resolve(cwd, file);
    if (!absPath.startsWith(resolvedCwd + '/') && absPath !== resolvedCwd) {
      throw new Error(
        `Context file "${file}" resolves outside the working directory. Use files within your project.`,
      );
    }
    const fileName = basename(absPath);
    const dest = resolve(initialContextDir(treeSlug), fileName);
    await cp(absPath, dest);
    added.push(fileName);
  }

  const merged = new Set(config.initial_context_files);
  for (const name of added) merged.add(name);
  config.initial_context_files = [...merged];

  await saveTree(config);
  await rebuildContext(treeSlug);

  return { added, tree: config };
}

export async function resolveTree(nameOrSlug: string): Promise<TreeConfig> {
  const trees = await listTrees();
  const slug = toSlug(nameOrSlug);
  const lower = nameOrSlug.toLowerCase();
  const match = trees.find(
    (t) => t.slug === slug || t.slug === lower || t.name.toLowerCase() === lower,
  );
  if (!match) {
    const available = trees.length
      ? `\nAvailable trees:\n${trees.map((t) => `  - ${t.name} (${t.slug})`).join('\n')}`
      : '';
    throw new Error(`Tree "${nameOrSlug}" not found.${available}`);
  }
  return match;
}

export async function loadTree(slug: string): Promise<TreeConfig> {
  assertValidSlug(slug, 'tree slug');
  const path = treeJsonPath(slug);
  if (!(await fileExists(path))) {
    throw new Error(`Tree "${slug}" not found. Run "cctree init" to create one.`);
  }

  const raw = await readFile(path, 'utf-8');
  return JSON.parse(raw) as TreeConfig;
}

export async function saveTree(config: TreeConfig): Promise<void> {
  await writeFile(treeJsonPath(config.slug), JSON.stringify(config, null, 2));
}

export async function getActiveTree(): Promise<TreeConfig | null> {
  try {
    const slug = (await readFile(paths.activeTree, 'utf-8')).trim();
    if (!slug) return null;
    return await loadTree(slug);
  } catch {
    return null;
  }
}

export async function getActiveTreeOrFail(): Promise<TreeConfig> {
  const tree = await getActiveTree();
  if (!tree) {
    throw new Error('No active tree. Run "cctree init" or "cctree use <name>" first.');
  }
  return tree;
}

export async function setActiveTree(slug: string): Promise<void> {
  await ensureDir(paths.base);
  await writeFile(paths.activeTree, slug);
}

export async function addChild(treeSlug: string, child: ChildSession): Promise<void> {
  assertValidSlug(child.slug, 'session name');
  const config = await loadTree(treeSlug);

  const exists = config.children.some((c) => c.slug === child.slug);
  if (exists) {
    throw new Error(`Child session "${child.name}" already exists in tree "${config.name}".`);
  }

  config.children.push(child);
  await saveTree(config);
}

export async function updateChildStatus(
  treeSlug: string,
  childSlug: string,
  status: ChildSession['status'],
  committedAt?: string,
): Promise<void> {
  const config = await loadTree(treeSlug);
  const child = config.children.find((c) => c.slug === childSlug);
  if (!child) {
    throw new Error(`Child session "${childSlug}" not found in tree "${config.name}".`);
  }

  child.status = status;
  if (committedAt) {
    child.committed_at = committedAt;
  }

  await saveTree(config);
}

export async function saveChildSummary(
  treeSlug: string,
  childSlug: string,
  content: string,
): Promise<void> {
  await ensureDir(childrenDir(treeSlug));
  await writeFile(childSummaryPath(treeSlug, childSlug), content);
}

export async function loadChildSummary(
  treeSlug: string,
  childSlug: string,
): Promise<string> {
  const path = childSummaryPath(treeSlug, childSlug);
  if (!(await fileExists(path))) {
    throw new Error(`No summary found for session "${childSlug}". It may not have been committed yet.`);
  }
  return readFile(path, 'utf-8');
}

export async function listTrees(): Promise<TreeConfig[]> {
  await ensureDir(paths.trees);

  const entries = await readdir(paths.trees, { withFileTypes: true });
  const trees: TreeConfig[] = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      try {
        const config = await loadTree(entry.name);
        trees.push(config);
      } catch {
        // skip corrupted trees
      }
    }
  }

  return trees.sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export async function findChildByNameOrSlug(
  tree: TreeConfig,
  nameOrSlug: string,
): Promise<ChildSession | null> {
  const lower = nameOrSlug.toLowerCase();
  return (
    tree.children.find(
      (c) => c.slug === lower || c.name.toLowerCase() === lower,
    ) ?? null
  );
}

export async function writeActiveSession(session: ActiveSession): Promise<void> {
  await ensureDir(paths.base);
  await writeFile(paths.activeSession, JSON.stringify(session, null, 2));
}

export async function readActiveSession(): Promise<ActiveSession | null> {
  try {
    const raw = await readFile(paths.activeSession, 'utf-8');
    return JSON.parse(raw) as ActiveSession;
  } catch {
    return null;
  }
}
