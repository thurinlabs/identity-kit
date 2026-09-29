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
  },
  {
    // One file for pages with no build step: `ThurinCheck.checkKeyFor`, viem and openpgp inside.
    entry: { 'thurin-check': 'src/browser.ts' },
    format: ['iife'],
    globalName: 'ThurinCheck',
    platform: 'browser',
    outExtension: () => ({ js: '.min.js' }),
    minify: true,
    noExternal: [/.*/],
    sourcemap: false,
    clean: false,
    metafile: true,   // scripts/bundle-licenses.mjs lists every package the bundle holds from it
    banner: { js: '/*! thurin-check.min.js, @thurinlabs/identity-kit (MIT). Bundles openpgp (LGPL-3.0) and MIT packages: see thurin-check.LICENSES.txt */' },
  },
])
