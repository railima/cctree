import { listTrees, setActiveTree } from '../lib/storage.js';
import { toSlug } from '../utils/slug.js';

export async function useCommand(name: string): Promise<void> {
  try {
    const trees = await listTrees();
    const slug = toSlug(name);

    const match = trees.find(
      (t) => t.slug === slug || t.name.toLowerCase() === name.toLowerCase(),
    );

    if (!match) {
      console.error(`Tree "${name}" not found.`);
      if (trees.length > 0) {
        console.error('Available trees:');
        for (const t of trees) {
          console.error(`  - ${t.name} (${t.slug})`);
        }
      }
      process.exit(1);
    }

    await setActiveTree(match.slug);
    console.log(`Switched to tree "${match.name}".`);
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
    process.exit(1);
  }
}
