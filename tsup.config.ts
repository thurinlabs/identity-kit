import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: { index: 'src/index.ts', core: 'src/core/index.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    splitting: true,
    sourcemap: false,   // tsup's CJS maps embed the builder's absolute path
    clean: true,
    external: ['viem'],
  }
])
