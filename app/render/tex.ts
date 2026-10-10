/**
 * TeX → SVG with MathJax, for the page and for textures in the headset alike.
 *
 * Why MathJax and not KaTeX: KaTeX writes HTML that needs its web fonts, and HTML cannot be drawn
 * into a WebGL texture without tainting the canvas. MathJax's SVG output draws every glyph as a
 * path, so the same SVG goes inline in the page and, as an image, onto a canvas for the headset.
 *
 * set.mm's `latexdef`s assume a few LaTeX packages MathJax does not have; MACROS maps those onto
 * what it does have. app/render/tex.test.ts typesets every statement in data/ to keep this honest.
 */
import { mathjax } from 'mathjax-full/js/mathjax.js';
import { TeX } from 'mathjax-full/js/input/tex.js';
import { SVG } from 'mathjax-full/js/output/svg.js';
import { liteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js';
import { AllPackages } from 'mathjax-full/js/input/tex/AllPackages.js';

export const MACROS: Record<string, string | [string, number]> = {};

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);
const doc = mathjax.document('', {
  InputJax: new TeX({ packages: AllPackages.filter((p: string) => p !== 'bussproofs' && p !== 'noundefined'), macros: MACROS }),
  OutputJax: new SVG({ fontCache: 'none' }),
});

export interface Typeset {
  svg: string;
  /** Size in ex (about half the font size) */
  width: number;
  height: number;
  /** Baseline offset in ex (negative: the box drops below the baseline) */
  valign: number;
  /** MathJax's message when the TeX did not parse */
  error: string | null;
}

const cache = new Map<string, Typeset>();

export function texToSvg(tex: string, display = false): Typeset {
  const key = `${display ? 'D' : 'I'}${tex}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const node = doc.convert(tex, { display });
  const svgNode = adaptor.firstChild(node) as never;
  const svg = adaptor.outerHTML(svgNode);
  const attr = (a: string) => adaptor.getAttribute(svgNode, a) ?? '';
  const va = attr('style').match(/vertical-align:\s*(-?[\d.]+)ex/);
  const err = svg.match(/data-mjx-error="([^"]*)"/);
  const out: Typeset = {
    svg,
    width: parseFloat(attr('width')) || 0,
    height: parseFloat(attr('height')) || 0,
    valign: va ? parseFloat(va[1] as string) : 0,
    error: err ? (err[1] as string) : null,
  };
  cache.set(key, out);
  return out;
}
