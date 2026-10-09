import * as THREE from 'three';
import { richBlock } from './rich.js';

/**
 * The headset's panel: the page's card (src/ui/card.js), drawn on a canvas that floats beside the
 * mine. A controller ray that meets it gives a point on the canvas; `hit` turns that into the button
 * under it. The same views as the card: a crystal, a derivation being walked, a derivation finished.
 */
export const PANEL_M = [0.5, 0.75]; // metres
const W = 1024;
const H = 1536;
const PAD = 44;
const CW = W - 2 * PAD;

const C = {
  bg: 'rgba(14,17,22,0.94)',
  line: 'rgba(255,255,255,0.16)',
  text: '#e8edf2',
  muted: '#9aa5b1',
  gold: '#ffcf5a',
  open: '#5fd4c4',
  good: '#7fdc8c',
  bad: '#ff7a85',
};

export function createPanel(app) {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(...PANEL_M), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
  mesh.name = 'panel';

  let buttons = [];
  let hover = null;
  let seq = 0;
  const graph = app.graph;

  /** Build the rows for the current view: text blocks and buttons. */
  async function rows() {
    const out = [];
    const text = async (src, o = {}) => out.push({ type: 'text', b: await richBlock(g, src, { maxW: CW, ...o }), gap: o.gap ?? 16, drop: o.drop });
    const button = async (label, action, o = {}) =>
      out.push({
        type: 'button',
        action,
        style: o.style || 'ghost',
        state: o.state || '',
        b: await richBlock(g, label, { maxW: CW - 44, kind: o.kind || 'prose', size: o.size || 32, weight: o.style === 'primary' ? 650 : 400, color: o.style === 'primary' ? '#1b1405' : o.state === 'wrong' ? C.muted : C.text }),
        gap: o.gap ?? 14,
      });

    const n = app.selected && graph.get(app.selected);
    const mined = graph.results.filter((r) => app.mined.has(r.id)).length;
    if (!n) {
      await text('Truth Mines', { size: 52, weight: 700 });
      await text(`${mined} of ${graph.results.length} results mined`, { size: 30, color: C.gold, gap: 30 });
      await text('Point at a crystal and pull the trigger (or pinch) to see it. Pulsing crystals are ready to mine.', { size: 32 });
      await text('Grip: grab the mine and move it. Thumbstick: turn it and zoom. B or Y: bring it back in front of you.', { size: 28, color: C.muted });
      return out;
    }
    const st = app.status(n.id);
    const eyebrow = `${graph.veins[n.vein].name.toUpperCase()} · ${n.law ? 'SURFACE' : `LEVEL ${n.depth}`}`;
    const run = app.run;

    if (run) {
      const step = run.step;
      await text(`MINING · STEP ${run.k + 1} OF ${run.steps.length}`, { size: 24, color: C.muted, gap: 8 });
      await text(n.title, { size: 38, weight: 700, gap: 14 });
      await text(n.derivation.goal, { size: 27, color: C.muted, gap: 18, drop: 2 });
      for (const [i, l] of run.lines.entries()) await text(l, { kind: 'display', size: 28, gap: 10, drop: 1 + i / 100 });
      await text(step.ask, { size: 31, weight: 600, gap: 18 });
      for (const [i, o] of step.options.entries()) {
        const state = run.right === i ? 'right' : run.wrong.has(i) ? 'wrong' : '';
        const live = run.right == null && !run.wrong.has(i);
        await button(o.tex || o.text, live ? `pick:${i}` : null, { kind: o.tex ? 'tex' : 'prose', style: 'option', state, size: 31 });
      }
      if (run.last?.ok) {
        await text(`✓ Correct.${step.after ? ` ${step.after}` : ''}`, { size: 29, color: C.good, gap: 14 });
        await button(run.k + 1 === run.steps.length ? 'Finish' : 'Next step →', 'next', { style: 'primary' });
      } else if (run.last) {
        await text(`✗ Not quite. ${run.last.why}`, { size: 28, color: C.bad, gap: 14 });
      }
      await button('Stop and go back', 'leave', { size: 26 });
      return out;
    }

    if (app.finished?.id === n.id) {
      const f = app.finished;
      await text('MINED', { size: 24, color: C.gold, gap: 8 });
      await text(n.title, { size: 40, weight: 700 });
      await text(n.result, { kind: 'display', size: 36, color: C.gold, gap: 20 });
      await text(f.firstTry === f.steps ? 'Every step right first time.' : `${f.firstTry} of ${f.steps} steps right first time.`, { size: 30, weight: 600, color: C.gold });
      await text(n.derivation.done, { size: 28, color: C.muted, drop: 1 });
      for (const id of n.to.filter((t) => app.status(t) === 'open')) await button(`Now open: ${graph.get(id).title}`, `go:${id}`, { size: 28 });
      await button('Back to the crystal', 'leave', { size: 28 });
      return out;
    }

    await text(eyebrow, { size: 24, color: C.muted, gap: 8 });
    await text(n.title, { size: 42, weight: 700 });
    await text(n.result, { kind: 'display', size: 36, color: st === 'mined' ? C.gold : C.text, gap: 20 });
    if (n.about) await text(n.about, { size: 29, color: C.muted });
    else if (n.derivation) await text(n.derivation.goal, { size: 29, color: C.muted, drop: 1 });
    const status = {
      law: ['A law: given, not derived. Digging starts here.', C.gold],
      mined: ['Mined. You have derived this.', C.gold],
      open: ['Ready to mine. Everything it needs is mined.', C.open],
      locked: ['Locked. Mine what it comes from first.', C.muted],
    }[st];
    await text(status[0], { size: 30, weight: 600, color: status[1], gap: 20 });
    if (st === 'open') await button('Mine it', 'mine', { style: 'primary', size: 34 });
    if (st === 'mined') await button('Walk it again', 'mine', { size: 30 });
    for (const id of n.from) await button(`From: ${graph.get(id).title}`, `go:${id}`, { size: 26 });
    for (const id of n.to) await button(`Leads to: ${graph.get(id).title}`, `go:${id}`, { size: 26 });
    await button('Close', 'close', { size: 26 });
    return out;
  }

  const rowH = (r) => (r.type === 'button' ? r.b.h + 36 : r.b.h);

  async function draw() {
    const my = ++seq;
    let list = await rows();
    if (my !== seq) return;
    // Too tall for the panel: drop the least needed rows first (old working lines, then the goal).
    const total = () => list.reduce((s, r) => s + rowH(r) + r.gap, 0);
    while (total() > H - 2 * PAD) {
      const cands = list.filter((r) => r.drop != null);
      if (!cands.length) break;
      const lowest = cands.reduce((a, b) => (b.drop < a.drop ? b : a));
      list = list.filter((r) => r !== lowest);
    }

    g.clearRect(0, 0, W, H);
    g.fillStyle = C.bg;
    roundRect(g, 0, 0, W, H, 40);
    g.fill();
    g.strokeStyle = C.line;
    g.lineWidth = 4;
    g.stroke();

    buttons = [];
    let y = PAD;
    for (const r of list) {
      if (r.type === 'text') {
        r.b.draw(g, PAD, y, CW);
      } else {
        const h = r.b.h + 36;
        const hot = r.action && r.action === hover;
        const fill = {
          primary: C.gold,
          option: r.state === 'right' ? 'rgba(127,220,140,0.18)' : hot ? 'rgba(95,212,196,0.16)' : 'rgba(255,255,255,0.05)',
          ghost: hot ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.05)',
        }[r.style];
        const edge = r.state === 'right' ? C.good : r.state === 'wrong' ? C.bad : hot ? C.open : C.line;
        g.fillStyle = fill;
        roundRect(g, PAD, y, CW, h, 22);
        g.fill();
        if (r.style !== 'primary' || hot) {
          g.strokeStyle = hot && r.style === 'primary' ? '#ffffff' : edge;
          g.lineWidth = hot ? 5 : 3;
          g.stroke();
        }
        r.b.draw(g, PAD + 22, y + 18, CW - 44);
        if (r.action) buttons.push({ x: PAD, y, w: CW, h, action: r.action });
      }
      y += rowH(r) + r.gap;
    }
    tex.needsUpdate = true;
  }

  return {
    mesh,
    draw,
    /** The button under a point on the panel (uv from a raycast), or null. */
    hit(uv) {
      if (!uv) return null;
      const x = uv.x * W;
      const y = (1 - uv.y) * H;
      return buttons.find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h)?.action || null;
    },
    setHover(action) {
      if (action === hover) return;
      hover = action;
      draw();
    },
    get buttons() {
      return buttons;
    },
  };
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}
