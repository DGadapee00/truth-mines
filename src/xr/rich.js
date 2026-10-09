import { texToSvg, splitProse } from '../math/tex.js';

/**
 * Prose and math drawn on a canvas, for the headset panel (a headset shows no page, only textures).
 *
 * Math comes from MathJax as SVG, is loaded as an image, and sits on the text's baseline. Images
 * load asynchronously, so a block is prepared first (`await richBlock(...)`) and drawn after,
 * synchronously. Loaded images are kept, so redrawing the same text is quick.
 */
const loaded = new Map();

function mathImage(tex, display, color, exPx) {
  const key = `${display ? 'D' : 'I'}|${color}|${exPx}|${tex}`;
  if (!loaded.has(key)) {
    const r = texToSvg(tex, display);
    const w = Math.max(1, r.width * exPx);
    const h = Math.max(1, r.height * exPx);
    const svg = r.svg
      .replace(/currentColor/g, color)
      .replace(/width="[\d.]+ex"/, `width="${w}px"`)
      .replace(/height="[\d.]+ex"/, `height="${h}px"`);
    const img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    const item = { img, w, h, depth: Math.max(0, -r.valign * exPx), ready: null };
    item.ready = img.decode().then(
      () => item,
      () => item,
    );
    loaded.set(key, item);
  }
  return loaded.get(key).ready;
}

/**
 * Lay out rich text to a width. Returns { w, h, draw(g, x, y) } once its math has loaded.
 *   kind  'prose' (text with $…$), 'tex' (inline TeX alone), 'display' (centred display TeX)
 */
export async function richBlock(g, src, { kind = 'prose', size = 32, weight = 400, color = '#e8edf2', maxW = 800, lineGap = 0.35, align = 'left' } = {}) {
  const font = `${weight} ${size}px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`;
  const exPx = size * 0.5;
  const pieces = kind === 'prose' ? splitProse(src) : [{ math: true, s: src }];
  const display = kind === 'display';

  // Tokens: words, spaces, math images.
  const tokens = [];
  g.save();
  g.font = font;
  for (const p of pieces) {
    if (p.math) {
      const m = await mathImage(p.s, display, color, display ? exPx * 1.1 : exPx);
      const s = m.w > maxW ? maxW / m.w : 1;
      tokens.push({ kind: 'math', m, w: m.w * s, h: m.h * s, depth: m.depth * s });
    } else {
      for (const part of p.s.split(/(\s+)/)) {
        if (!part) continue;
        if (/^\s+$/.test(part)) tokens.push({ kind: 'space', w: g.measureText(' ').width });
        else tokens.push({ kind: 'word', s: part, w: g.measureText(part).width });
      }
    }
  }
  g.restore();

  // Lines, broken at spaces (math and words never split).
  const lines = [];
  let line = { items: [], w: 0 };
  for (const t of tokens) {
    if (t.kind === 'space') {
      if (line.items.length) line.items.push(t), (line.w += t.w);
      continue;
    }
    if (line.w + t.w > maxW && line.items.length) {
      while (line.items.at(-1)?.kind === 'space') line.w -= line.items.pop().w;
      lines.push(line);
      line = { items: [], w: 0 };
    }
    line.items.push(t);
    line.w += t.w;
  }
  while (line.items.at(-1)?.kind === 'space') line.w -= line.items.pop().w;
  if (line.items.length) lines.push(line);

  for (const l of lines) {
    l.asc = size * 0.8;
    l.desc = size * 0.25;
    for (const t of l.items) {
      if (t.kind !== 'math') continue;
      l.asc = Math.max(l.asc, t.h - t.depth);
      l.desc = Math.max(l.desc, t.depth);
    }
  }
  const gap = size * lineGap;
  const h = lines.reduce((s, l) => s + l.asc + l.desc, 0) + gap * Math.max(0, lines.length - 1);
  const w = Math.max(0, ...lines.map((l) => l.w));

  return {
    w,
    h,
    draw(g2, x, y, width = maxW) {
      g2.save();
      g2.font = font;
      g2.fillStyle = color;
      g2.textBaseline = 'alphabetic';
      let top = y;
      for (const l of lines) {
        const base = top + l.asc;
        let cx = x + (align === 'center' || display ? (width - l.w) / 2 : 0);
        for (const t of l.items) {
          if (t.kind === 'word') g2.fillText(t.s, cx, base);
          else if (t.kind === 'math') g2.drawImage(t.m.img, cx, base - (t.h - t.depth), t.w, t.h);
          cx += t.w;
        }
        top += l.asc + l.desc + gap;
      }
      g2.restore();
    },
  };
}
