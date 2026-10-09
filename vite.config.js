import { defineConfig } from 'vite';

// Relative asset paths, so the built site works from any folder (GitHub Pages serves it under
// /truth-mines/).
export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 2000 },
});
