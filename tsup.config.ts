import { defineConfig } from 'tsup'

export default defineConfig([
  // Library build (React peer deps)
  {
    entry: { index: 'src/index.ts', core: 'src/core/index.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    splitting: true,
    sourcemap: true,
    clean: true,
    external: ['react', 'react-dom', 'wagmi', 'viem', '@tanstack/react-query'],
    esbuildOptions(options) {
      options.jsx = 'automatic'
    },
  },
  // Standalone embed (all deps bundled, Shadow DOM isolates styles)
  {
    entry: ['src/embed.tsx'],
    format: ['iife'],
    globalName: 'ThurinEmbed',
    sourcemap: true,
    noExternal: [/.*/],
    loader: {
      '.css': 'text',
    },
    define: {
      'process.env.NODE_ENV': '"production"',
      'global': 'globalThis',
    },
    platform: 'browser',
    esbuildOptions(options) {
      options.jsx = 'automatic'
      options.alias = {
        'crypto': './src/shims/crypto.ts',
      }
    },
  },
])
