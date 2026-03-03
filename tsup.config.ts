import { defineConfig } from 'tsup';

const shared = {
  entry: ['src/index.ts'] as string[],
  sourcemap: true,
  dts: false,
  clean: false,
};

export default defineConfig([
  { ...shared, format: ['esm'], outDir: 'dist/esm' },
  { ...shared, format: ['cjs'], outDir: 'dist/cjs' },
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    outDir: 'dist/types',
    dts: { only: true },
    clean: false,
  },
]);
