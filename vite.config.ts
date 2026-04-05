import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
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
})
