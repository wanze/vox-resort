import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { MUSIC_CACHE, STREAMED_MUSIC } from './src/features/pwa/domain/precacheRules.ts';

const SAND = '#dccdb1';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      // Registered by useUpdate, so a reload can wait for the autosave.
      injectRegister: false,
      manifest: {
        name: 'Vox Resort',
        short_name: 'Vox Resort',
        description: 'Build and run a voxel beach resort.',
        lang: 'en',
        display: 'standalone',
        background_color: SAND,
        theme_color: SAND,
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff,woff2,mp3}'],
        // The main chunk is 1.75 MB against Workbox's 2 MiB default, and a file over the cap is
        // skipped with only a warning. scripts/check-precache.ts fails the build if one is.
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        manifestTransforms: [
          (entries) => ({ manifest: entries.filter((entry) => !STREAMED_MUSIC.test(entry.url)) }),
        ],
        runtimeCaching: [
          {
            urlPattern: STREAMED_MUSIC,
            handler: 'CacheFirst',
            options: {
              cacheName: MUSIC_CACHE,
              expiration: { maxEntries: 10, purgeOnQuotaError: true },
              cacheableResponse: { statuses: [200] },
              rangeRequests: true,
              plugins: [
                {
                  // <audio> asks for byte ranges, and a 206 cannot be cached: fetch the whole track.
                  // Copied into sw.js as source text, so it may use nothing from this file.
                  requestWillFetch: async ({ request }) =>
                    new Request(request.url, { credentials: 'same-origin' }),
                },
              ],
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: [
      // three's addons import from "three"; aliasing it to the WebGPU build keeps one copy of the core classes.
      { find: /^three$/, replacement: 'three/webgpu' },
    ],
    // @divinevoxel/vlox and @amodx/* ship extensionless ESM specifiers.
    extensions: ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json'],
  },
  optimizeDeps: {
    // Keep DVE's deep, extensionless imports on Vite's resolver instead of esbuild's.
    exclude: ['@divinevoxel/vlox', '@amodx/math', '@amodx/binary', '@amodx/threads'],
  },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'voxel-gen/**/*.test.ts'],
    environment: 'node',
    // The generator and sim tests run whole plots and days; 2-3 s here is 5 s+ on a CI runner.
    testTimeout: 30_000,
    server: {
      deps: {
        // Node's ESM resolver rejects the extensionless specifiers these packages ship.
        inline: [/@divinevoxel\//, /@amodx\//],
      },
    },
  },
});
