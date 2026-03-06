import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/cli.ts'],
    format: ['esm'],
    target: 'node18',
    platform: 'node',
    splitting: true,
    sourcemap: true,
    clean: true,
    dts: false,
    external: ['better-sqlite3'],
    banner: {
      js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
    },
    esbuildOptions(options) {
      options.jsx = 'automatic';
    },
  },
  {
    entry: ['src/workers/analysis-worker.ts'],
    format: ['esm'],
    target: 'node18',
    platform: 'node',
    splitting: false,
    sourcemap: true,
    clean: false,
    dts: false,
    external: ['better-sqlite3'],
    banner: {
      js: "import { createRequire as __createRequire } from 'module'; const require = __createRequire(import.meta.url);",
    },
    outDir: 'dist/workers',
  },
]);
