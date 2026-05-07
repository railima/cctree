import { findInTrees, formatFindMatches } from '../lib/find.js';

export async function findCommand(query: string): Promise<void> {
  try {
    const matches = await findInTrees(query);
    process.stdout.write(`${formatFindMatches(matches, query)}\n`);
    if (matches.length === 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
    process.exit(1);
  }
}
