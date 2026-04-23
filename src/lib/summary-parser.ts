const PATH_PATTERN =
  /(?:^|[\s(`'"])((?:[a-zA-Z0-9_.-]+\/)+[a-zA-Z0-9_.-]+\.(?:ts|tsx|js|jsx|mjs|cjs|py|rb|go|rs|java|kt|swift|md|sql|json|yml|yaml|toml|sh))(?=[\s).,`'":]|$)/gm;

export function extractFilePaths(summary: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  let match: RegExpExecArray | null;

  PATH_PATTERN.lastIndex = 0;
  while ((match = PATH_PATTERN.exec(summary)) !== null) {
    const path = match[1];
    if (!seen.has(path)) {
      seen.add(path);
      result.push(path);
    }
  }

  return result;
}
