import { texToSvg } from './tex';

/**
 * TeX drawn onto a canvas, for textures (the statement wall in the Inside view, later the headset).
 * MathJax's SVG draws glyphs as paths, so as an image it needs no fonts and keeps the canvas
 * clean for WebGL.
 */
const images = new Map<string, Promise<HTMLImageElement>>();

export interface MathImage {
  img: HTMLImageElement;
  width: number;
  height: number;
}

/** The TeX as an image, `exPx` pixels per ex, in `color`. */
export async function mathImage(tex: string, display: boolean, color: string, exPx: number): Promise<MathImage> {
  const t = texToSvg(tex, display);
  const width = Math.max(1, t.width * exPx);
  const height = Math.max(1, t.height * exPx);
  const key = `${display}|${color}|${exPx}|${tex}`;
  let p = images.get(key);
  if (!p) {
    const svg = t.svg
      .replace(/currentColor/g, color)
      .replace(/width="[\d.]+ex"/, `width="${width}px"`)
      .replace(/height="[\d.]+ex"/, `height="${height}px"`);
    const img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    p = img.decode().then(() => img);
    images.set(key, p);
  }
  return { img: await p, width, height };
}

/**
 * The TeX rendered at the size that fills a w × h box (never more than `maxEx` pixels per ex),
 * so short statements read large and long ones shrink to fit, both drawn at full resolution.
 */
export async function mathImageToFit(tex: string, display: boolean, color: string, w: number, h: number, maxEx: number): Promise<MathImage> {
  const t = texToSvg(tex, display);
  const ex = Math.max(4, Math.min(maxEx, w / Math.max(0.1, t.width), h / Math.max(0.1, t.height)));
  return mathImage(tex, display, color, Math.floor(ex));
}

/** Draw `m` centred in the box, scaled down (never up) to fit. */
export function drawFitted(g: CanvasRenderingContext2D, m: MathImage, x: number, y: number, w: number, h: number) {
  const k = Math.min(1, w / m.width, h / m.height);
  const dw = m.width * k;
  const dh = m.height * k;
  g.drawImage(m.img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}
