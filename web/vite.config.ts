import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: process.env.VITE_BASE || '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['fonts/*.woff2', 'icons/*.png', 'icons/*.svg'],
      manifest: {
        name: 'Cupola',
        short_name: 'Cupola',
        description:
          'Self-hosted monitoring for the Linux boxes you run: metrics, processes, services and apps.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: '#f6f7f9',
        background_color: '#f6f7f9',
        icons: [
          { src: '/icons/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/pwa-1024x1024.png', sizes: '1024x1024', type: 'image/png' },
          { src: '/icons/pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,svg,png,webmanifest}'],
        navigateFallback: 'index.html',
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        runtimeCaching: [
          {
            // The hub API is network-first: last-known state is what the offline
            // banner names. The event stream is excluded — a never-ending body
            // cannot be cached, and a cached attempt holds the connection until
            // the 4 s network timeout, so every later request queues behind it.
            urlPattern: ({ url }) => url.pathname.startsWith('/api/') && !url.pathname.startsWith('/api/v1/stream'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'cupola-api',
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 64, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
        ],
      },
    }),
  ],
  build: {
    target: 'es2022',
  },
  server: {
    port: 5173,
    // `CUPOLA_DEV_HUB=http://127.0.0.1:4180 npm run dev` serves the UI from Vite
    // against a running hub (e.g. scripts/e2e-hub.sh).
    proxy: process.env.CUPOLA_DEV_HUB
      ? { '/api': { target: process.env.CUPOLA_DEV_HUB, changeOrigin: false, ws: true } }
      : undefined,
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
});
