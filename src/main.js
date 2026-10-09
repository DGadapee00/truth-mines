import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildGraph } from './mine/graph.js';
import { layoutMine } from './mine/layout.js';
import { createMine } from './mine/scene.js';
import { createApp } from './app.js';
import { createCard } from './ui/card.js';
import { createXR } from './xr/xr.js';
import './style.css';

const $ = (id) => document.getElementById(id);
const canvas = $('c');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const BG = 0x07090c;
const scene = new THREE.Scene();
scene.background = new THREE.Color(BG);
scene.fog = new THREE.FogExp2(BG, 0.012);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.05, 400);
camera.position.set(0, 6, 44);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.target.set(0, -6, 0);
controls.minDistance = 5;
controls.maxDistance = 90;
controls.update();

const graph = buildGraph();
const mine = createMine(graph, layoutMine(graph));
scene.add(mine.group);

const app = createApp(graph);
createCard($('card'), app);

// ---- picking a crystal: a click, not the end of a drag
const raycaster = new THREE.Raycaster();
let down = null;
canvas.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY }));
canvas.addEventListener('pointerup', (e) => {
  if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
  down = null;
  const r = canvas.getBoundingClientRect();
  raycaster.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
  const id = mine.pick(raycaster);
  if (id) app.select(id);
});
canvas.addEventListener('pointermove', (e) => {
  if (down) return;
  const r = canvas.getBoundingClientRect();
  raycaster.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
  canvas.style.cursor = mine.pick(raycaster) ? 'pointer' : '';
});

// ---- the camera glides to a selected crystal, keeping the angle the student chose
let glide = null;
let lastSelected = null;
function glideTo(id) {
  const to = mine.positionOf(id).clone();
  const dir = camera.position.clone().sub(controls.target).normalize();
  glide = { t: 0, fromT: controls.target.clone(), fromP: camera.position.clone(), toT: to, toP: to.clone().addScaledVector(dir, 18) };
}
function stepGlide(dt) {
  if (!glide) return;
  glide.t = Math.min(1, glide.t + dt / 0.9);
  const k = glide.t * glide.t * (3 - 2 * glide.t);
  controls.target.lerpVectors(glide.fromT, glide.toT, k);
  camera.position.lerpVectors(glide.fromP, glide.toP, k);
  if (glide.t >= 1) glide = null;
}
controls.addEventListener('start', () => (glide = null));

app.onChange(() => {
  mine.select(app.selected);
  if (app.selected && app.selected !== lastSelected && !xr.active) glideTo(app.selected);
  lastSelected = app.selected;
  showProgress();
});

function showProgress() {
  const n = graph.results.filter((r) => app.mined.has(r.id)).length;
  $('progress').textContent = `${n} / ${graph.results.length} mined`;
}
showProgress();

// ---- the picture sits beside the card, not under it
function frameBesideCard() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const card = $('card');
  let dx = 0;
  let dy = 0;
  if (!card.hidden) {
    const r = card.getBoundingClientRect();
    if (w > 720) dx = Math.round((w - r.left + 12) / 2);
    else dy = Math.round((h - r.top) / 2);
  }
  const v = camera.view;
  const cur = v?.enabled ? [v.offsetX, v.offsetY] : [0, 0];
  if (cur[0] === dx && cur[1] === dy && v?.fullWidth === w) return;
  if (!dx && !dy) camera.clearViewOffset();
  else camera.setViewOffset(w, h, dx, dy, w, h);
}

// ---- header buttons
$('btn-help').addEventListener('click', () => {
  const help = $('help');
  help.hidden = !help.hidden;
  $('btn-help').setAttribute('aria-expanded', String(!help.hidden));
});
$('btn-reset').addEventListener('click', () => {
  if (confirm('Forget everything you have mined and start the mine over?')) app.reset();
});

const xr = createXR({ renderer, scene, camera, controls, mine, app, fog: scene.fog });

window.addEventListener('resize', () => {
  if (renderer.xr.isPresenting) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const clock = new THREE.Clock();
let time = 0;
renderer.setAnimationLoop((t, frame) => {
  const dt = Math.min(0.05, clock.getDelta());
  time += dt;
  if (xr.active) xr.update(dt, frame);
  else {
    stepGlide(dt);
    controls.update();
    frameBesideCard();
  }
  mine.update(app.mined, time);
  renderer.render(scene, camera);
});

// For the check scripts.
window.__mines = { app, xr, mine, camera, controls };
