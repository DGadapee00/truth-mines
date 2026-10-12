import { describe, expect, it } from 'vitest';
import { parseCathedral, type CathedralFile } from '../../../core/schema';
import { readData } from './data';
import { buildPlan, newMotion, poseAt, stepMotion, type MotionPlan } from './motion';

const cathedral = parseCathedral(readData('cathedral.json'));
const plan = buildPlan(cathedral.threshold);

/** Run the whole move at a frame rate; return what a headset would feel. */
function run(p: MotionPlan, hz: number) {
  const m = newMotion();
  const dt = 1 / hz;
  let t = 0;
  let maxV = 0;
  let maxA = 0;
  let prevV = 0;
  let backwards = false;
  let prevS = 0;
  const speedIn: Record<string, number> = {};
  while (!m.done && t < 120) {
    stepMotion(m, dt, p);
    t += dt;
    maxV = Math.max(maxV, m.v);
    maxA = Math.max(maxA, Math.abs(m.v - prevV) / dt);
    if (m.s < prevS - 1e-9) backwards = true;
    const seg = p.segments.findIndex((g) => m.s >= g.s_from && m.s < g.s_to);
    if (seg >= 0) speedIn[seg] = Math.max(speedIn[seg] ?? 0, m.v);
    prevV = m.v;
    prevS = m.s;
  }
  return { t, m, maxV, maxA, backwards, speedIn };
}

describe('the threshold motion', () => {
  it('takes between 20 and 30 seconds, easing included, at headset and desktop frame rates', () => {
    for (const hz of [36, 60, 72, 90, 120]) {
      const r = run(plan, hz);
      expect(r.m.done, `${hz} Hz`).toBe(true);
      expect(r.t, `${hz} Hz`).toBeGreaterThanOrEqual(20);
      expect(r.t, `${hz} Hz`).toBeLessThanOrEqual(30);
    }
  });

  it('takes the same time at any frame rate, within a quarter of a second', () => {
    const times = [30, 72, 144].map((hz) => run(plan, hz).t);
    expect(Math.max(...times) - Math.min(...times)).toBeLessThan(0.25);
  });

  it('ends exactly on the dais, at rest', () => {
    const r = run(plan, 72);
    expect(r.m.s).toBeCloseTo(plan.total, 6);
    expect(r.m.v).toBe(0);
    const end = poseAt(plan, r.m.s, [0, 0, 0]);
    expect(end).toEqual(cathedral.arrival.pos);
  });

  it('never goes faster than the descriptor’s speeds, and the descent is the slow part', () => {
    const r = run(plan, 72);
    const [drift, descent] = cathedral.threshold.segments;
    expect(r.speedIn[0]).toBeLessThanOrEqual(drift!.speed + 1e-6);
    expect(r.speedIn[1]).toBeLessThanOrEqual(descent!.speed + 1e-6);
    expect(descent!.speed).toBeLessThan(drift!.speed);
  });

  it('eases: speed rises from rest and falls to rest at a bounded acceleration, with no jerk at the start', () => {
    const r = run(plan, 72);
    const limit = Math.max(...cathedral.threshold.segments.map((s) => s.speed)) / cathedral.threshold.ease_s;
    expect(r.maxA).toBeLessThanOrEqual(limit * 1.05);
    const m = newMotion();
    stepMotion(m, 1 / 72, plan);
    expect(m.v).toBeLessThan(0.05); // nowhere near full speed after one frame
    for (let i = 0; i < 72 * 3; i++) stepMotion(m, 1 / 72, plan);
    expect(m.v).toBeCloseTo(cathedral.threshold.segments[0]!.speed, 2); // and at full drift speed after the ease
  });

  it('only ever moves forward along the path', () => {
    expect(run(plan, 72).backwards).toBe(false);
  });

  it('survives a long frame (a hitch in the headset) without overshooting the end', () => {
    const m = newMotion();
    for (let i = 0; i < 200 && !m.done; i++) stepMotion(m, i % 17 === 0 ? 0.5 : 1 / 72, plan);
    expect(m.s).toBeLessThanOrEqual(plan.total + 1e-9);
    const big = newMotion();
    stepMotion(big, 100, plan);
    expect(big.s).toBeLessThanOrEqual(plan.total);
  });

  it('descends straight down at the end: the last metres of the path have no sideways or forward drift', () => {
    const p = poseAt(plan, plan.total - 4, [0, 0, 0]);
    expect(p[0]).toBe(0);
    expect(p[2]).toBe(0);
    expect(p[1]).toBeGreaterThan(3.5);
  });

  it('poseAt follows the path: its start, a middle point and clamped overshoot', () => {
    expect(poseAt(plan, 0, [0, 0, 0])).toEqual(cathedral.threshold.path[0]);
    expect(poseAt(plan, -5, [0, 0, 0])).toEqual(cathedral.threshold.path[0]);
    expect(poseAt(plan, plan.total + 5, [0, 0, 0])).toEqual(cathedral.arrival.pos);
    const mid = poseAt(plan, plan.total / 2, [0, 0, 0]);
    expect(mid[1]).toBeLessThanOrEqual(cathedral.threshold.path[0]![1]);
  });

  it('the vignette strength follows the segment, stronger on the descent', () => {
    expect(plan.vignetteAt(1)).toBe(cathedral.threshold.segments[0]!.vignette);
    expect(plan.vignetteAt(plan.total - 1)).toBe(cathedral.threshold.segments[1]!.vignette);
    expect(plan.vignetteAt(plan.total - 1)).toBeGreaterThan(plan.vignetteAt(1));
  });

  it('works for a synthetic straight path too', () => {
    const t: CathedralFile['threshold'] = {
      ...cathedral.threshold,
      path: [[0, 0, 0], [0, 0, 10], [0, 0, 20]],
      segments: [{ kind: 'drift', s_from: 0, s_to: 10, speed: 2, vignette: 0.3 }, { kind: 'descent', s_from: 10, s_to: 20, speed: 1, vignette: 0.6 }],
      ease_s: 1,
    };
    const r = run(buildPlan(t), 60);
    expect(r.m.done).toBe(true);
    expect(r.t).toBeGreaterThan(10 / 2 + 10 / 1); // easing only adds time
    expect(r.t).toBeLessThan(10 / 2 + 10 / 1 + 3);
  });
});
