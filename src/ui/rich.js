import { texToSvg, splitProse } from '../math/tex.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** TeX as inline SVG markup for the page. */
export function texHTML(tex, display = false) {
  const { svg } = texToSvg(tex, display);
  return display ? `<div class="mjx-d">${svg}</div>` : `<span class="mjx-i">${svg}</span>`;
}

/** Prose with $…$ math, as HTML. */
export function proseHTML(s) {
  return splitProse(s)
    .map((p) => (p.math ? texHTML(p.s) : esc(p.s)))
    .join('');
}

/** An option: TeX or prose. */
export const optionHTML = (o) => (o.tex ? texHTML(o.tex) : proseHTML(o.text));

export { esc };
