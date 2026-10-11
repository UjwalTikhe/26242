import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Dev proxy: the frontend talks to the backend through the same origin so
// cookies/origins stay clean and the PWA works when hosted behind one domain.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'pwa-192.png', 'pwa-512.png'],
      manifest: {
        name: 'DakshSetu — AI-Assisted RPL Skill Assessment',
        short_name: 'DakshSetu',
        description: 'Government RPL skill assessment: declare, get assessed, get certified.',
        theme_color: '#1f3864',
        background_color: '#f4f6fa',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        lang: 'en',
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        // App shell: network first so updates land, cached shell for offline start.
        navigateFallback: '/',
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        runtimeCaching: [
          {
            // Contract GETs are cacheable for offline reads (stale-while-revalidate).
            urlPattern: ({ url }) => url.pathname.startsWith('/api/') && (url.pathname.includes('/assessments') || url.pathname.includes('/trades') || url.pathname.includes('/profile') || url.pathname.includes('/verify')),
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'api-get-cache', expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 7 } },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
      '/realtime': { target: 'http://localhost:4000', ws: true },
      '/health': { target: 'http://localhost:4000', changeOrigin: true },
    },
  },
  build: { outDir: 'dist', sourcemap: false },
});