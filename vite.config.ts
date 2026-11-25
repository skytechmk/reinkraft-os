import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Reinkraft OS',
        short_name: 'Reinkraft',
        start_url: '/',
        display: 'standalone',
        background_color: '#0F1115',
        theme_color: '#F59E0B',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
      workbox: {
        // app shell + assets only; Supabase data goes through the IndexedDB outbox
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        navigateFallback: '/index.html',
        // a new deploy takes over at once; otherwise browsers keep the old cached app
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        // fonts are cached after first load so the shop keeps its look offline
        runtimeCaching: [
          { urlPattern: ({ url }: { url: URL }) => url.origin === 'https://fonts.googleapis.com', handler: 'StaleWhileRevalidate', options: { cacheName: 'google-fonts-css' } },
          { urlPattern: ({ url }: { url: URL }) => url.origin === 'https://fonts.gstatic.com', handler: 'CacheFirst', options: { cacheName: 'google-fonts-files', expiration: { maxEntries: 20, maxAgeSeconds: 31536000 }, cacheableResponse: { statuses: [0, 200] } } },
        ],
      },
    }),
  ],
  server: { port: 5173 },
});
