import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

/** Emit version.json on every build — PWAs poll this to force-refresh. */
function versionJsonPlugin() {
  return {
    name: 'version-json',
    closeBundle() {
      const buildId = `b${Date.now()}`
      const outDir = resolve(__dirname, 'dist')
      mkdirSync(outDir, { recursive: true })
      writeFileSync(
        resolve(outDir, 'version.json'),
        JSON.stringify({ buildId, builtAt: new Date().toISOString() }, null, 2),
      )
      console.log(`[version-json] ${buildId}`)
    },
  }
}

export default defineConfig({
  // Relative base: same build works at domain root (/) or inside a folder (/dist/, /app/).
  // Absolute '/' was the reason a Hostinger upload showed a blank white page.
  base: './',
  plugins: [
    react(),
    versionJsonPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'pwa-192.png', 'pwa-512.png', 'update-app.html'],
      manifest: {
        name: 'Restaurant Manager',
        short_name: 'Restaurant',
        description: 'Restaurant billing, orders, KOT & reports',
        theme_color: '#f97316',
        background_color: '#fafafa',
        display: 'standalone',
        orientation: 'any',
        scope: '.',
        start_url: '.',
        categories: ['business', 'food'],
        icons: [
          {
            src: 'pwa-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Never let the SW cache the version ping or the one-time updater page
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/\/backend\//, /\/version\.json$/, /\/update-app\.html$/],
        runtimeCaching: [
          {
            urlPattern: /version\.json$/i,
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /update-app\.html$/i,
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-stylesheets',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
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
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/backend': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
