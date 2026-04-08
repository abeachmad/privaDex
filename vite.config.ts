import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const isProd = mode === 'production'

  return {
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  build: {
    // @provablehq/sdk uses top-level await — requires modern targets
    target: 'esnext',
    // Strip console.log/debug/info in production to prevent leaking
    // sensitive material (record plaintexts, wallet addresses, merkle proofs)
    minify: 'esbuild',
  },
  esbuild: {
    // Strip sensitive console methods in production but keep error/warn
    // for runtime diagnostics. console.log/debug/info often contain
    // record plaintexts, wallet addresses, and merkle proofs.
    pure: isProd
      ? ['console.log', 'console.debug', 'console.info', 'console.trace']
      : [],
    drop: isProd ? ['debugger'] : [],
  },
  optimizeDeps: {
    exclude: ['@provablehq/sdk'],
    // SDK is excluded (WASM), but its CJS deps must be pre-bundled
    // so Vite converts require() → ESM imports for the browser
    include: [
      'core-js/proposals/json-parse-with-source.js',
      'libsodium-wrappers',
    ],
  },
  server: {
    port: 5173,
    strictPort: true,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
    watch: {
      ignored: ['**/.bg-shell/**', '**/node_modules/**', '**/dist/**', '**/.gsd/**'],
    },
  },
  }
})
