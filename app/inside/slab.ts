import * as THREE from 'three';
import { plainName } from '../../core/graph';
import type { MineNode } from '../../core/schema';
import { drawFitted, mathImageToFit } from '../render/canvasMath';
import { createLruCache, STATEMENT_TEXTURE_CAP } from './textureCache';

/**
 * The texture on a chamber's statement wall: the landmark's name, its statement (the readable
 * form when there is one), and where it comes from. Drawn on a canvas, so it works the same on
 * the headset.
 *
 * Each distinct statement is rasterized once. Re-entering a chamber reuses the texture. The cache
 * keeps STATEMENT_TEXTURE_CAP textures and disposes the rest.
 */
const textures = createLruCache<THREE.CanvasTexture>(STATEMENT_TEXTURE_CAP);
const inflight = new Map<string, Promise<THREE.CanvasTexture>>();

function textureKey(n: MineNode, aspect: number): string {
  return [n.id, n.kind, plainName(n), n.statement, n.display, n.display_reviewed ? '1' : '0', n.depth, aspect].join('\u0000');
}

/** The statement wall's texture, from the cache when this statement was already rasterized. */
export async function statementTexture(n: MineNode, aspect: number): Promise<THREE.CanvasTexture> {
  const key = textureKey(n, aspect);
  const hit = textures.get(key);
  if (hit) return hit;
  const pending = inflight.get(key);
  if (pending) return pending;
  const job = rasterizeStatement(n, aspect).then(
    (tex) => {
      inflight.delete(key);
      textures.set(key, tex);
      return tex;
    },
    (err: unknown) => {
      inflight.delete(key);
      throw err;
    },
  );
  inflight.set(key, job);
  return job;
}

async function rasterizeStatement(n: MineNode, aspect: number): Promise<THREE.CanvasTexture> {
  const W = 2048;
  const H = Math.round(W / aspect);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d') as CanvasRenderingContext2D;
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#2a2c31');
  grad.addColorStop(1, '#17181c');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(255, 214, 140, 0.55)';
  g.lineWidth = 10;
  g.strokeRect(24, 24, W - 48, H - 48);

  g.fillStyle = '#f2e6cf';
  g.textAlign = 'center';
  g.textBaseline = 'top';
  g.font = '600 92px system-ui, -apple-system, "Segoe UI", sans-serif';
  g.fillText(plainName(n), W / 2, 70, W - 160);

  const tex = n.display || n.statement;
  const m = await mathImageToFit(tex, true, '#fff7e6', W - 220, H - 400, 150);
  drawFitted(g, m, 110, 220, W - 220, H - 400);

  g.fillStyle = 'rgba(242, 230, 207, 0.6)';
  g.font = '48px system-ui, -apple-system, "Segoe UI", sans-serif';
  g.textBaseline = 'bottom';
  const kind = n.kind[0]?.toUpperCase() + n.kind.slice(1);
  g.fillText(`${kind} ${n.id} in set.mm · depth ${n.depth}${n.display && !n.display_reviewed ? ' · readable form not yet reviewed' : ''}`, W / 2, H - 60, W - 160);

  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
