import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // Relative URLs so the same build works at a site root or under a subpath
  // (this app is served from https://<user>.github.io/minis-listbuilder/xwing/).
  base: './',
  build: { outDir: '../../dist/xwing', emptyOutDir: true },
  // Visual Studio keeps files under .vs locked, which breaks the file watcher; obj/bin are its build output.
  server: { watch: { ignored: ['**/.vs/**', '**/obj/**', '**/bin/**'] } },
  plugins: [
    svelte(),
    VitePWA({
      // 'prompt': a new version (including new points) downloads in the background, and the app shows an
      // "Update" banner instead of reloading mid-edit or mid-game.
      registerType: 'prompt',
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'icon.svg'],
      manifest: {
        name: "Milk's X-Wing Squad Builder",
        short_name: "Milk's X-Wing",
        description: 'X-Wing squad builder for X-Wing Alliance, AMG and 2.0 Legacy points, with homebrew rules and a match tracker',
        theme_color: '#0b0f1a',
        background_color: '#0b0f1a',
        display: 'standalone',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache the app and every ruleset's cards so building and tracking work fully offline.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2,json}'],
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});
