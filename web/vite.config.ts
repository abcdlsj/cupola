import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: process.env.VITE_BASE || '/',
  plugins: [
    react(),
    tailwindcss(),
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
        theme_color: '#0b0c0e',
        background_color: '#0b0c0e',
        icons: [
          { src: '/icons/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/pwa-1024x1024.png', sizes: '1024x1024', type: 'image/png' },
          { src: '/icons/pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,svg,png,webmanifest}'],
        // The design-system demo is a second entry, not part of the PWA: keeping
        // it out of the precache stops every install from downloading Astryx.
        globIgnores: ['demo.html', 'assets/demo-*.js', 'assets/demo-*.css'],
        navigateFallback: 'index.html',
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        runtimeCaching: [
          {
            // the hub API is network-first: last-known state is what the offline banner names
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
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
    rollupOptions: {
      // The Astryx design-system demo is a local evaluation entry, never part of
      // the shipped build: `npm run dev` serves it at /demo.html, and
      // `VITE_DEMO=1 npm run build` builds it on purpose. A plain build ships
      // only the app.
      input: process.env.VITE_DEMO === '1' || process.env.VITE_DEMO_ONLY
        ? { main: 'index.html', demo: 'demo.html' }
        : { main: 'index.html' },
    },
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
