import { defineConfig } from 'tsup'

export default defineConfig([
  // Library build (React peer deps)
  {
    entry: { index: 'src/index.ts', core: 'src/core/index.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    splitting: true,
    sourcemap: false,   // tsup's CJS maps embed the builder's absolute path
    clean: true,
    external: ['react', 'react-dom', 'wagmi', 'viem', '@tanstack/react-query'],
    esbuildOptions(options) {
      options.jsx = 'automatic'
    },
  }
])
