/**
 * TeX → SVG with MathJax, for the page and for the headset alike.
 *
 * MathJax's SVG output draws every glyph as a path, so it needs no fonts: the same SVG goes inline
 * in the page and, turned into an image, onto the headset panel's canvas.
 */
import { mathjax } from 'mathjax-full/js/mathjax.js';
import { TeX } from 'mathjax-full/js/input/tex.js';
import { SVG } from 'mathjax-full/js/output/svg.js';
import { liteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js';
import { AllPackages } from 'mathjax-full/js/input/tex/AllPackages.js';

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);
const doc = mathjax.document('', {
  InputJax: new TeX({ packages: AllPackages.filter((p) => p !== 'bussproofs') }),
  OutputJax: new SVG({ fontCache: 'none' }),
});

const cache = new Map();

/**
 * One piece of TeX as an SVG string, with its size in ex (MathJax's unit: about half the font size).
 * `error` is the message when the TeX does not parse.
 */
export function texToSvg(tex, display = false) {
  const key = `${display ? 'D' : 'I'}${tex}`;
  if (cache.has(key)) return cache.get(key);
  const node = doc.convert(tex, { display });
  const svgNode = adaptor.firstChild(node);
  const svg = adaptor.outerHTML(svgNode);
  const width = parseFloat(adaptor.getAttribute(svgNode, 'width')) || 0;
  const height = parseFloat(adaptor.getAttribute(svgNode, 'height')) || 0;
  const va = adaptor.getAttribute(svgNode, 'style')?.match(/vertical-align:\s*(-?[\d.]+)ex/);
  const m = svg.match(/data-mjx-error="([^"]*)"/);
  const out = { svg, width, height, valign: va ? parseFloat(va[1]) : 0, error: m ? m[1] : null };
  cache.set(key, out);
  return out;
}

/** Prose with inline $…$ math, split into text and math pieces. */
export function splitProse(s) {
  return String(s ?? '')
    .split('$')
    .map((part, i) => ({ math: i % 2 === 1, s: part }))
    .filter((p) => p.s !== '');
}
