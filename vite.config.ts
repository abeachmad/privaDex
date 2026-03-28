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
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
    watch: {
      // .bg-shell/manifest.json changes every 2s (pi process tracker)
      // This was causing constant full page reloads
      ignored: ['**/.bg-shell/**', '**/node_modules/**', '**/dist/**', '**/.gsd/**'],
    },
  },
})
