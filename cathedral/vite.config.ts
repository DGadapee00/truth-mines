import { copyFileSync, createReadStream, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { iwsdkDev } from '@iwsdk/vite-plugin-dev';
import { defineConfig, type Plugin } from 'vite';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// The pipeline's data (../data, built by `python -m pipeline`, never edited by hand) is served at
// /data/ in development and copied to dist/data in a build. Only what the cathedral reads goes
// into the build: scene.json (the Inside view's 4 MB) stays out.
const DATA_FILES = ['cathedral.json', 'pathways.json', 'graph.json', 'plane-number-theory.json'];

function pipelineData(): Plugin {
  const dir = (f: string) => here(`../data/${f}`);
  return {
    name: 'pipeline-data',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const m = /^\/data\/([\w.-]+\.json)(\?.*)?$/.exec(req.url ?? '');
        if (!m || !DATA_FILES.includes(m[1] as string) || !existsSync(dir(m[1] as string))) return next();
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        createReadStream(dir(m[1] as string)).pipe(res);
      });
    },
    closeBundle() {
      mkdirSync(here('./dist/data'), { recursive: true });
      for (const f of DATA_FILES) {
        if (!existsSync(dir(f))) throw new Error(`../data/${f} is missing: run \`python -m pipeline\` first`);
        copyFileSync(dir(f), here(`./dist/data/${f}`));
      }
    },
  };
}

export default defineConfig({
  plugins: [iwsdkDev(), pipelineData()],
  server: { host: '0.0.0.0', port: 8081, open: false, fs: { allow: ['..'] } },
  build: {
    outDir: 'dist',
    sourcemap: process.env.NODE_ENV !== 'production',
    target: 'esnext',
    rollupOptions: { input: './index.html' },
  },
  esbuild: { target: 'esnext' },
  resolve: {
    // The mine's plane builders (../app/plane) and ../core import 'three'. IWSDK pins three to
    // super-three, so every 'three' must resolve to this package's copy: a second copy would break
    // instanceof checks. (The same applies to the uikit packages.)
    alias: [
      { find: /^three$/, replacement: here('./node_modules/three/build/three.module.js') },
      { find: /^three\/addons\//, replacement: here('./node_modules/three/examples/jsm/') },
    ],
    dedupe: ['three', '@pmndrs/uikit', '@pmndrs/uikit-horizon', '@pmndrs/uikit-lucide'],
  },
  optimizeDeps: {
    exclude: ['@babylonjs/havok'],
    include: ['three', '@pmndrs/uikit', '@pmndrs/uikit-horizon', '@pmndrs/uikit-lucide', '@drawcall/uikitml'],
    esbuildOptions: { target: 'esnext' },
  },
  publicDir: 'public',
  base: './',
});
