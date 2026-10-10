import { defineConfig } from 'vite';

// data/ (built by `python -m pipeline`, never edited by hand) is served as the site's public
// folder, so graph.json, meta.json, fonts/ and notes/ sit next to the page. Relative asset paths
// let the site work from any folder, such as GitHub Pages' /truth-mines/.
export default defineConfig({
  base: './',
  publicDir: 'data',
  build: { chunkSizeWarningLimit: 2500 },
  server: { host: true },
});
