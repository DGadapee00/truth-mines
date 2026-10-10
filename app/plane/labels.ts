import * as THREE from 'three';

/**
 * Text in the plane, drawn on canvases so it works the same on the desktop and in a headset
 * (and leaves the pinned label font and its glyph check alone). All the labels of one kind are a
 * single instanced mesh on one atlas texture, so a hundred numbers cost one draw call. Each label
 * turns about the vertical axis to face you and never rolls.
 */
const FONT = '"DejaVu Sans", "Liberation Sans", "Segoe UI", system-ui, sans-serif';

export interface LabelSpec {
  text: string;
  pos: [number, number, number];
  /** World height in metres; the width follows the cell's shape */
  height: number;
  color?: string;
}

const VERT = /* glsl */ `
attribute vec3 offset;
attribute vec4 rect;
attribute vec2 size;
attribute vec3 tint;
attribute float alpha;
uniform float uNear;
uniform float uFar;
varying vec2 vUv;
varying vec3 vTint;
varying float vAlpha;
void main() {
  vec3 toCam = cameraPosition - offset;
  toCam.y = 0.0;
  float l = length(toCam);
  toCam = l > 1e-4 ? toCam / l : vec3(0.0, 0.0, 1.0);
  vec3 right = vec3(toCam.z, 0.0, -toCam.x);
  vec3 world = offset + right * position.x * size.x + vec3(0.0, 1.0, 0.0) * position.y * size.y;
  vUv = rect.xy + (position.xy + 0.5) * rect.zw;
  vTint = tint;
  float d = distance(cameraPosition, offset);
  // Fade with distance, and also very close up, where a glyph would fill the view.
  vAlpha = alpha * smoothstep(1.5, 4.0, d) * (1.0 - smoothstep(uNear, uFar, d));
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}`;

const FRAG = /* glsl */ `
uniform sampler2D map;
varying vec2 vUv;
varying vec3 vTint;
varying float vAlpha;
void main() {
  float a = texture2D(map, vUv).a * vAlpha;
  if (a < 0.02) discard;
  gl_FragColor = vec4(vTint, a);
}`;

export interface LabelOptions {
  cellW: number;
  cellH: number;
  perRow: number;
  fontPx: number;
  bold?: boolean;
  /** Labels fade out between these distances (metres) */
  fade?: [number, number];
}

export class LabelSet {
  readonly mesh: THREE.Mesh;
  private readonly alpha: THREE.InstancedBufferAttribute;
  private readonly texture: THREE.CanvasTexture;
  private readonly geometry: THREE.InstancedBufferGeometry;
  private readonly material: THREE.ShaderMaterial;

  constructor(specs: readonly LabelSpec[], o: LabelOptions) {
    const rows = Math.ceil(specs.length / o.perRow);
    const canvas = document.createElement('canvas');
    canvas.width = o.cellW * o.perRow;
    canvas.height = o.cellH * rows;
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    ctx.fillStyle = '#fff';
    ctx.font = `${o.bold === false ? '' : 'bold '}${o.fontPx}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const n = specs.length;
    const offset = new Float32Array(n * 3);
    const rect = new Float32Array(n * 4);
    const size = new Float32Array(n * 2);
    const tint = new Float32Array(n * 3);
    const alpha = new Float32Array(n).fill(1);
    const colour = new THREE.Color();
    specs.forEach((s, i) => {
      const col = i % o.perRow;
      const row = Math.floor(i / o.perRow);
      ctx.fillText(s.text, col * o.cellW + o.cellW / 2, row * o.cellH + o.cellH / 2 + 2);
      offset.set(s.pos, i * 3);
      rect.set([(col * o.cellW) / canvas.width, 1 - ((row + 1) * o.cellH) / canvas.height, o.cellW / canvas.width, o.cellH / canvas.height], i * 4);
      size.set([(s.height * o.cellW) / o.cellH, s.height], i * 2);
      colour.set(s.color ?? '#ffffff');
      tint.set([colour.r, colour.g, colour.b], i * 3);
    });
    this.texture = new THREE.CanvasTexture(canvas);
    this.texture.anisotropy = 4;
    this.geometry = new THREE.InstancedBufferGeometry().copy(new THREE.PlaneGeometry(1, 1) as unknown as THREE.InstancedBufferGeometry);
    this.geometry.instanceCount = n;
    this.geometry.setAttribute('offset', new THREE.InstancedBufferAttribute(offset, 3));
    this.geometry.setAttribute('rect', new THREE.InstancedBufferAttribute(rect, 4));
    this.geometry.setAttribute('size', new THREE.InstancedBufferAttribute(size, 2));
    this.geometry.setAttribute('tint', new THREE.InstancedBufferAttribute(tint, 3));
    this.alpha = new THREE.InstancedBufferAttribute(alpha, 1);
    this.alpha.setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('alpha', this.alpha);
    const [near, far] = o.fade ?? [40, 70];
    this.material = new THREE.ShaderMaterial({
      uniforms: { map: { value: this.texture }, uNear: { value: near }, uFar: { value: far } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
  }

  setAlpha(i: number, a: number) {
    if (this.alpha.getX(i) === a) return;
    this.alpha.setX(i, a);
    this.alpha.needsUpdate = true;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
  }
}

/** One sign that faces you: a few lines of text on a dark plate. Used for the focus label and the overlook marker. */
export class Sign {
  readonly mesh: THREE.Mesh;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly texture: THREE.CanvasTexture;
  private last = '';

  constructor(
    readonly width: number,
    readonly height: number,
    private readonly px = 200,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = Math.round(width * px);
    this.canvas.height = Math.round(height * px);
    this.ctx = this.canvas.getContext('2d') as CanvasRenderingContext2D;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.anisotropy = 4;
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, depthWrite: false, toneMapped: false }),
    );
    this.mesh.renderOrder = 10;
    this.mesh.visible = false;
  }

  /** Draw lines of text; the first is large. Cheap to call every frame: it redraws only on change. */
  set(lines: readonly string[], accent = '#ffcf5a') {
    const key = lines.join('\n') + accent;
    if (key === this.last) return;
    this.last = key;
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(8, 10, 14, 0.82)';
    ctx.strokeStyle = accent;
    ctx.lineWidth = 3;
    const r = 18;
    ctx.beginPath();
    ctx.roundRect(2, 2, canvas.width - 4, canvas.height - 4, r);
    ctx.fill();
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const n = lines.length;
    const lineH = canvas.height / n;
    lines.forEach((line, i) => {
      const size = Math.min(lineH * (i === 0 && n > 1 ? 0.62 : 0.6), (canvas.width * 0.94) / Math.max(8, line.length * 0.58));
      ctx.font = `${i === 0 ? 'bold ' : ''}${size}px ${FONT}`;
      ctx.fillStyle = i === 0 ? '#ffffff' : '#c7d0dc';
      ctx.fillText(line, canvas.width / 2, lineH * (i + 0.5) + 2);
    });
    this.texture.needsUpdate = true;
  }

  /** Stand at `p`, turned about the vertical axis toward `cam`. */
  place(p: THREE.Vector3, cam: THREE.Vector3) {
    this.mesh.position.copy(p);
    this.mesh.rotation.set(0, Math.atan2(cam.x - p.x, cam.z - p.z), 0);
  }

  dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.texture.dispose();
  }
}
