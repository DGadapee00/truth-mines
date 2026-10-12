/**
 * Mouse and keyboard on the desktop: drag to look, click to act, W A S D or the arrows to walk
 * (the visitor's own movement, never anything that moves them), and a few keys. It only reports;
 * app.ts decides what each does in the current phase.
 */
export interface DesktopCallbacks {
  /** A click that was not a drag, at normalised device coordinates */
  onClick(ndc: { x: number; y: number }): void;
  onKey(code: string): void;
  onTalk(down: boolean): void;
}

export class DesktopInput {
  /** Descriptor yaw: the way the visitor faces is (sin, cos) */
  heading = 0;
  pitch = 0;
  /** Pointer position in normalised device coordinates, or null when it is outside the view */
  pointer: { x: number; y: number } | null = null;
  readonly keys = new Set<string>();
  private drag: { x: number; y: number; moved: boolean } | null = null;

  constructor(
    private readonly el: HTMLElement,
    private readonly cb: DesktopCallbacks,
    private readonly active: () => boolean,
  ) {
    const ndc = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      return { x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -(((e.clientY - r.top) / r.height) * 2 - 1) };
    };
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || !(e.target as HTMLElement).closest('#scene-container')) return;
      this.drag = { x: e.clientX, y: e.clientY, moved: false };
    });
    window.addEventListener('pointermove', (e) => {
      if ((e.target as HTMLElement)?.closest?.('#scene-container')) this.pointer = ndc(e);
      else this.pointer = null;
      if (!this.drag) return;
      const dx = e.clientX - this.drag.x;
      const dy = e.clientY - this.drag.y;
      if (!this.drag.moved && Math.hypot(dx, dy) < 4) return;
      this.drag.moved = true;
      this.drag.x = e.clientX;
      this.drag.y = e.clientY;
      if (!this.active()) return;
      this.heading -= dx * 0.0045; // turning right lowers the yaw: left of (sin, cos) is the positive side
      this.pitch = Math.max(-1.3, Math.min(1.3, this.pitch - dy * 0.0045));
    });
    window.addEventListener('pointerup', (e) => {
      const d = this.drag;
      this.drag = null;
      if (d && !d.moved && (e.target as HTMLElement)?.closest?.('#scene-container') && this.active()) this.cb.onClick(ndc(e));
    });
    el.addEventListener('pointerleave', () => (this.pointer = null));
    window.addEventListener('keydown', (e) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code === 'KeyV' && !e.repeat) cb.onTalk(true);
      if (!this.active()) return;
      this.keys.add(e.code);
      if (!e.repeat) this.cb.onKey(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (e.code === 'KeyV') cb.onTalk(false);
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.drag = null;
      cb.onTalk(false);
    });
  }

  /** The walking intent: +1 forward / right, -1 back / left, from the keys held */
  walk(): { forward: number; right: number; fast: boolean } {
    const k = this.keys;
    return {
      forward: (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0),
      right: (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0),
      fast: k.has('ShiftLeft') || k.has('ShiftRight'),
    };
  }
}
