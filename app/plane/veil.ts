/**
 * The veil over the road's stacks. While it is on, every composite column is drawn in one plain
 * colour; taking a stack apart rightly lets its blocks take their prime colours one after another,
 * `step` seconds apart, each with a small pulse as it does. Pure timing, no drawing: road.ts paints
 * from this. With the veil off (the map app) every stack is as the pipeline describes it.
 */
export class Veil {
  /** n -> the time its reveal began */
  private readonly revealedAt = new Map<number, number>();
  private time = 0;

  constructor(
    readonly step: number,
    public on = true,
  ) {}

  /** Advance the clock; true if anything is still assembling */
  tick(dt: number): boolean {
    this.time += dt;
    return this.animating();
  }

  reveal(n: number): void {
    if (!this.revealedAt.has(n)) this.revealedAt.set(n, this.time);
  }

  /** The veil is off, or this stack has been taken apart */
  isRevealed(n: number): boolean {
    return !this.on || this.revealedAt.has(n);
  }

  /** Block k of column n: whether it shows its prime's colour yet, and a 0..1 pulse while it arrives */
  block(n: number, k: number): { coloured: boolean; pulse: number } {
    if (!this.on) return { coloured: true, pulse: 0 };
    const at = this.revealedAt.get(n);
    if (at === undefined) return { coloured: false, pulse: 0 };
    const t = this.time - (at + k * this.step);
    if (t < 0) return { coloured: false, pulse: 0 };
    return { coloured: true, pulse: t < this.step ? Math.sin((t / this.step) * Math.PI) : 0 };
  }

  /** Whether a stack is still assembling (its last block has not finished its pulse) */
  assembling(n: number, blocks: number): boolean {
    const at = this.revealedAt.get(n);
    return this.on && at !== undefined && this.time < at + blocks * this.step;
  }

  animating(): boolean {
    return this.on && [...this.revealedAt.values()].some((at) => this.time < at + 12 * this.step); // no stack has more than 12 blocks
  }
}
