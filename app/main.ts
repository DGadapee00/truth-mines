import * as THREE from 'three';
import { MineGraph, displayName } from '../core/graph';
import { parseGraph, parseMeta } from '../core/schema';
import { createMine } from './render/mine';
import { BG } from './render/palette';
import { createStore } from './state';
import { createCameraRig } from './ui/camera';
import { createPanel } from './ui/panel';
import { createSearch } from './ui/search';
import './style.css';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const BASE = import.meta.env.BASE_URL;

async function getJson(path: string): Promise<unknown> {
  const r = await fetch(`${BASE}${path}`);
  if (!r.ok) throw new Error(`${path}: ${r.status} ${r.statusText}`);
  return r.json();
}

async function main() {
  const [graphFile, meta] = await Promise.all([getJson('graph.json').then(parseGraph), getJson('meta.json').then(parseMeta)]);
  const graph = new MineGraph(graphFile);
  const store = createStore(graph);

  // ---- scene
  const canvas = $<HTMLCanvasElement>('c');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  scene.fog = new THREE.FogExp2(BG, 0.0065);
  const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 700);
  const rig = createCameraRig(camera, canvas);
  const mine = createMine(graph, meta, `${BASE}fonts/labels.woff`);
  scene.add(mine.group);

  // ---- panel, search, credits
  createPanel($('panel'), graph, meta, store, (p) => fetch(`${BASE}${p}`).then((r) => r.text()));
  createSearch($<HTMLInputElement>('search'), $('results'), graph, meta, store);
  const src = meta.sources.find((s) => s.name === 'set.mm');
  if (src) {
    $('credit-mm').innerHTML = `<a href="${src.repo}/tree/${src.commit}" target="_blank" rel="noopener">set.mm ${src.commit.slice(0, 7)}</a>`;
  }
  $('counts').textContent = `${meta.counts.nodes ?? 0} landmarks · ${(meta.counts.full_graph_statements ?? 0).toLocaleString('en-US')} statements in set.mm`;

  // ---- selection drives colour, travel and the address bar
  let last: string | null = null;
  store.onChange((v) => {
    mine.apply(v);
    // A tall, narrow screen sees less across, so it stands further back to show the same trace.
    if (v.selected && v.selected !== last) rig.travelTo(mine.position(v.selected), 24 / Math.min(1, camera.aspect * 1.1));
    last = v.selected;
    const hash = v.selected ? `#/n/${encodeURIComponent(v.selected)}` : '';
    if (location.hash !== hash) history.pushState(null, '', hash || location.pathname);
  });
  mine.apply(store.view);

  // ---- clicking and hovering in the mine
  let down: { x: number; y: number } | null = null;
  const at = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height };
  };
  canvas.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY }));
  canvas.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
    down = null;
    const p = at(e);
    const id = mine.pickScreen(p.x, p.y, camera, p.w, p.h, e.pointerType === 'touch' ? 26 : 16);
    if (id) store.select(id);
  });
  const tip = $('tip');
  canvas.addEventListener('pointermove', (e) => {
    if (e.buttons) return;
    const p = at(e);
    const id = mine.pickScreen(p.x, p.y, camera, p.w, p.h, 12);
    mine.setHover(id);
    canvas.style.cursor = id ? 'pointer' : '';
    tip.hidden = !id;
    if (id) {
      tip.textContent = displayName(graph.must(id));
      tip.style.transform = `translate(${e.clientX + 14}px, ${e.clientY + 12}px)`;
    }
  });
  canvas.addEventListener('pointerleave', () => ((tip.hidden = true), mine.setHover(null)));

  // ---- keys
  window.addEventListener('keydown', (e) => {
    if ((e.target as HTMLElement).tagName === 'INPUT') return;
    if (e.key === '/') {
      e.preventDefault();
      $('search').focus();
    } else if (e.key === 'Escape') store.select(null);
    else if (e.key === 'u' && store.view.selected) {
      const next = graph.pathToAxiom(store.view.selected)[1];
      if (next) store.select(next);
    } else if (e.key === 'h') rig.home();
  });
  $('btn-home').addEventListener('click', () => rig.home());

  // ---- first visit: a short welcome
  const intro = $('intro');
  let seen = false;
  try {
    seen = localStorage.getItem('truth-mines:intro') === '1';
  } catch {
    /* no storage: show it */
  }
  intro.hidden = seen;
  intro.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button');
    if (!b) return;
    intro.hidden = true;
    try {
      localStorage.setItem('truth-mines:intro', '1');
    } catch {
      /* fine */
    }
    if (b.dataset.go) store.select(b.dataset.go);
  });
  $('btn-help').addEventListener('click', () => (intro.hidden = !intro.hidden));

  // ---- the picture sits beside the panel on a wide screen, above it on a narrow one
  const panel = $('panel');
  function frameBesidePanel() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    let dx = 0;
    let dy = 0;
    if (!panel.hidden) {
      const r = panel.getBoundingClientRect();
      if (w > 760) dx = Math.round((w - r.left) / 2);
      else dy = Math.round((h - r.top) / 2);
    }
    const v = camera.view;
    if (v?.enabled && v.offsetX === dx && v.offsetY === dy && v.fullWidth === w && v.fullHeight === h) return;
    if (!dx && !dy) {
      if (v?.enabled) camera.clearViewOffset();
    } else camera.setViewOffset(w, h, dx, dy, w, h);
  }
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // ---- the address names the selected node: open it on load, and follow back/forward and edits
  const followHash = () => {
    const id = decodeURIComponent(location.hash.match(/^#\/n\/(.+)$/)?.[1] ?? '');
    if (id && graph.get(id)) {
      intro.hidden = true;
      if (store.view.selected !== id) store.select(id);
    } else if (!id && store.view.selected) store.select(null);
  };
  window.addEventListener('hashchange', followHash);
  followHash();

  const clock = new THREE.Clock();
  let time = 0;
  renderer.setAnimationLoop(() => {
    const dt = Math.min(0.05, clock.getDelta());
    time += dt;
    rig.update(dt);
    frameBesidePanel();
    mine.update(camera, time);
    renderer.render(scene, camera);
  });

  document.body.classList.add('ready');
  // For the end-to-end tests.
  Object.assign(window, { __mines: { graph, store, mine, camera, renderer, rig } });
}

main().catch((err: unknown) => {
  const box = document.getElementById('fail');
  if (box) {
    box.hidden = false;
    box.querySelector('code')!.textContent = String(err instanceof Error ? err.message : err);
  }
  console.error(err);
});
