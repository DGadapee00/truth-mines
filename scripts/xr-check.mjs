/**
 * Headset mode on an emulated Meta Quest 3 (IWER, Meta's WebXR emulator), in headless Chromium.
 * Needs the dev server: npx vite --port 5175 --strictPort
 *
 * Walks one derivation entirely with the controller: point at a crystal and pull the trigger, press
 * "Mine it" on the panel, pick a wrong option, then the right one at every step. Also checks the grip
 * moves the mine, the thumbstick turns it, and leaving the headset puts the page back.
 * Screenshots go to scripts/output/xr/.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { chromium } from './playwright.mjs';

const require = createRequire(import.meta.url);
const iwer = fs.readFileSync(require.resolve('iwer/build/iwer.min.js'), 'utf8');
const out = new URL('./output/xr/', import.meta.url).pathname;
fs.mkdirSync(out, { recursive: true });

const fails = [];
const expect = (ok, what, got) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${ok ? '' : ` (got ${JSON.stringify(got)})`}`);
  if (!ok) fails.push(what);
};

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 860 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.addInitScript(`${iwer};window.__dev = new IWER.XRDevice(IWER.metaQuest3); window.__dev.installRuntime({ forceInstall: true });`);
await page.goto('http://localhost:5175/');
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForTimeout(1500);
const ev = (fn, arg) => page.evaluate(fn, arg);
const wait = (ms) => page.waitForTimeout(ms);
let shot = 0;
const snap = (name) => page.screenshot({ path: `${out}${String(++shot).padStart(2, '0')}-${name}.png` });

expect(await ev(() => !document.getElementById('btn-vr').hidden), 'Enter VR button shows with a headset');
await ev(() => document.getElementById('btn-vr').click());
await wait(1500);
expect(await ev(() => window.__mines.xr.active), 'VR session starts');
await snap('mine');

/** Point the right controller from where it is at a point in the room, and pull the trigger. */
async function aimAndPull(target) {
  await ev((t) => {
    const c = window.__dev.controllers.right;
    const o = [c.position.x, c.position.y, c.position.z];
    const d = [t[0] - o[0], t[1] - o[1], t[2] - o[2]];
    const len = Math.hypot(...d);
    // Rotate −z onto d: axis = (−z) × d, angle between them.
    const from = [0, 0, -1];
    const u = d.map((x) => x / len);
    const axis = [from[1] * u[2] - from[2] * u[1], from[2] * u[0] - from[0] * u[2], from[0] * u[1] - from[1] * u[0]];
    const s = Math.hypot(...axis);
    const cos = -u[2];
    const ang = Math.atan2(s, cos);
    const n = s > 1e-9 ? axis.map((x) => x / s) : [1, 0, 0];
    const h = Math.sin(ang / 2);
    c.quaternion.set(n[0] * h, n[1] * h, n[2] * h, Math.cos(ang / 2));
  }, target);
  await wait(150);
  await ev(() => window.__dev.controllers.right.updateButtonValue('trigger', 1));
  await wait(150);
  await ev(() => window.__dev.controllers.right.updateButtonValue('trigger', 0));
  await wait(400);
}

/** A crystal's position in the room. */
const crystalAt = (id) =>
  ev((i) => {
    const m = window.__mines.mine;
    const p = m.positionOf(i).clone();
    m.group.localToWorld(p);
    return p.toArray();
  }, id);

/** A panel button's centre in the room. */
const buttonAt = (match) =>
  ev((mt) => {
    const { panel } = window.__mines.xr;
    const b = panel.buttons.find((x) => x.action === mt || x.action.startsWith(mt));
    if (!b) return null;
    const u = (b.x + b.w / 2) / 1024;
    const v = (b.y + b.h / 2) / 1536;
    const mesh = panel.mesh;
    const p = mesh.localToWorld(new mesh.position.constructor((u - 0.5) * 0.5, (0.5 - v) * 0.75, 0));
    return p.toArray();
  }, match);

await aimAndPull(await crystalAt('biot-wire'));
expect((await ev(() => window.__mines.app.selected)) === 'biot-wire', 'trigger on a crystal selects it');
await wait(500);
await snap('card');

const mineBtn = await buttonAt('mine');
expect(!!mineBtn, 'panel shows "Mine it"', mineBtn);
if (mineBtn) await aimAndPull(mineBtn);
expect(!!(await ev(() => window.__mines.app.run)), 'pressing "Mine it" on the panel starts the derivation');

// Step 1: a wrong pick first, then the right one, all through the panel.
const wrongIdx = await ev(() => window.__mines.app.run.step.options.findIndex((o) => !o.ok));
await wait(300);
await aimAndPull(await buttonAt(`pick:${wrongIdx}`));
expect((await ev(() => window.__mines.app.run.last?.ok)) === false, 'a wrong option on the panel says "not quite"');
await wait(300);
await snap('wrong');

let steps = 0;
for (let guard = 0; guard < 12; guard++) {
  const run = await ev(() => !!window.__mines.app.run);
  if (!run) break;
  const ok = await ev(() => window.__mines.app.run.step.options.findIndex((o) => o.ok));
  await wait(250);
  await aimAndPull(await buttonAt(`pick:${ok}`));
  if (steps === 3) await snap('working');
  await wait(250);
  const next = await buttonAt('next');
  if (!next) break;
  await aimAndPull(next);
  steps++;
}
expect(steps === 7, 'all 7 steps walked through the panel', steps);
expect(await ev(() => window.__mines.app.mined.has('biot-wire')), 'the crystal is mined at the end');
await wait(400);
await snap('mined');

// Grip moves the mine with the hand; thumbstick turns it.
const p0 = (await ev(() => window.__mines.xr.view)).p0;
await ev(() => window.__dev.controllers.left.updateButtonValue('squeeze', 1));
await wait(150);
await ev(() => {
  const c = window.__dev.controllers.left;
  c.position.set(c.position.x + 0.2, c.position.y, c.position.z);
});
await wait(250);
await ev(() => window.__dev.controllers.left.updateButtonValue('squeeze', 0));
await wait(150);
const p1 = (await ev(() => window.__mines.xr.view)).p0;
expect(Math.abs(p1[0] - p0[0] - 0.2) < 0.02, 'grip moves the mine 0.2 m with the hand', p1);
const th0 = (await ev(() => window.__mines.xr.view)).theta;
await ev(() => window.__dev.controllers.right.updateAxes('thumbstick', 0.9, 0));
await wait(500);
await ev(() => window.__dev.controllers.right.updateAxes('thumbstick', 0, 0));
const th1 = (await ev(() => window.__mines.xr.view)).theta;
expect(Math.abs(th1 - th0) > 0.2, 'thumbstick turns the mine', th1 - th0);
await wait(300);
await snap('turned');

await ev(() => window.__mines.xr.exit());
await wait(800);
expect(!(await ev(() => window.__mines.xr.active)), 'leaving the headset ends the session');
const back = await ev(() => ({ s: window.__mines.mine.group.scale.x, w: document.getElementById('c').width }));
expect(back.s === 1 && back.w > 0, 'the page view comes back', back);
await snap('page');
expect(!errors.length, 'no page errors', errors);

await browser.close();
console.log(fails.length ? `xr: ${fails.length} failure(s)` : 'xr: all checks passed');
process.exit(fails.length ? 1 : 0);
