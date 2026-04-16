import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: { cli: 'src/cli.ts' },
    format: ['esm'],
    target: 'node20',
    platform: 'node',
    outDir: 'dist',
    clean: true,
    sourcemap: true,
    banner: { js: '#!/usr/bin/env node' },
    external: [/^[^./]/],
  },
  {
    entry: { index: 'src/index.ts', server: 'src/server.ts' },
    format: ['esm'],
    target: 'node20',
    platform: 'node',
    outDir: 'dist',
    dts: true,
    sourcemap: true,
    external: [/^[^./]/],
  },
]);
