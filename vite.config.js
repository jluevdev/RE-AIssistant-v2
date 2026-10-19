import path from 'node:path'
import { fileURLToPath } from 'node:url'
import esbuild from 'esbuild'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const root = path.dirname(fileURLToPath(import.meta.url))
const simulatorPage = path.resolve(root, 'src/features/showings/ShowingsSimulatorPage.jsx')
const simulatorDisabled = path.resolve(root, 'src/features/showings/simulatorDisabled.jsx')
const lifecycleEntry = path.resolve(root, 'functions/showings/lifecycle.js')
const lifecycleVirtualId = '\0virtual:showings-lifecycle'

function showingsLifecyclePlugin() {
  return {
    name: 'showings-lifecycle',
    resolveId(id) {
      if (id === 'virtual:showings-lifecycle') return lifecycleVirtualId
    },
    async load(id) {
      if (id !== lifecycleVirtualId) return null
      const result = await esbuild.build({
        entryPoints: [lifecycleEntry],
        bundle: true,
        format: 'esm',
        platform: 'browser',
        write: false,
        define: { 'process.env': '{}' },
      })
      return result.outputFiles[0].text
    },
  }
}

export default defineConfig(({ command }) => ({
  resolve: {
    alias: {
      '@showings-simulator': command === 'serve' ? simulatorPage : simulatorDisabled,
    },
  },
  plugins: [
    showingsLifecyclePlugin(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon.svg', 'icons/maskable-icon.svg', 'vite.svg'],
      manifest: false,
      injectManifest: false,
      strategies: 'generateSW',
      workbox: {
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'html-navigations',
              networkTimeoutSeconds: 5,
              expiration: {
                maxEntries: 16,
                maxAgeSeconds: 60 * 60,
              },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  server: {
    port: 3000,
    open: true,
  },
}))
