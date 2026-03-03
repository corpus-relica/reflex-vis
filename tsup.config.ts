import { defineConfig } from 'tsup';

const entry = ['src/index.ts', 'src/tap.ts', 'src/remote.ts'] as string[];

const shared = {
  entry,
  sourcemap: true,
  dts: false,
  clean: false,
};

export default defineConfig([
  { ...shared, format: ['esm'], outDir: 'dist/esm' },
  { ...shared, format: ['cjs'], outDir: 'dist/cjs' },
  {
    entry,
    format: ['esm'],
    outDir: 'dist/types',
    dts: { only: true },
    clean: false,
  },
]);
