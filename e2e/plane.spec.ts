import { expect, test, type Page } from '@playwright/test';

/**
 * The number theory plane, end to end on the desktop: arrive at 1, read columns on the road,
 * strike numbers in the sieve plaza, and stand at the overlook. Screenshots of each moment go to
 * e2e/output/ for a look by eye. The checks read the plane through window.__mines.plane.
 */
interface PlaneHook {
  active: boolean;
  state: {
    active: boolean;
    zone: string | null;
    pos: [number, number] | null;
    heading: number;
    pitch: number;
    focus: { kind: 'road' | 'plaza'; n: number } | null;
    threads: number;
    travelling: boolean;
    stop: string | null;
    sieve: { standing: number[]; struck: number[]; done: boolean; animating: boolean } | null;
    marker: { x: number; pi: number; estimate: number; ratio: number } | null;
  };
  place(x: number, z: number): void;
  face(h: number, p?: number): void;
  lookAt(kind: 'road' | 'plaza', n: number): void;
  strike(n: number): number[] | null;
  reset(): void;
  goto(id: string): void;
  jump(id: string): void;
  screenOf(kind: 'road' | 'plaza', n: number): { x: number; y: number } | null;
  labelsOf(): string[];
  internals: { data: PlaneData };
}
interface PlaneData {
  stops: { id: string; pos: [number, number, number]; yaw: number }[];
  road: { columns: { n: number; pos: [number, number, number]; yaw: number; label: string; threads: unknown[][] }[] };
  plaza: { grid: { n: number; pos: [number, number, number] }[]; survivors: number[]; yaw: number; multiples: Record<string, number[]> };
  overlook: { samples: { x: number; pi: number; s: number; at: [number, number, number] }[]; scale: { origin: [number, number, number]; yaw: number }; road: { length: number } };
}
type W = { __mines: { plane: PlaneHook; renderer: { info: { render: { calls: number; triangles: number } } } } };
const shot = (page: Page, name: string) => page.screenshot({ path: `e2e/output/${test.info().project.name}-${name}.png` });
const st = (page: Page) => page.evaluate(() => (window as unknown as W).__mines.plane.state);

async function call<T>(page: Page, fn: string, ...args: unknown[]): Promise<T> {
  return page.evaluate(([f, a]) => ((window as unknown as W).__mines.plane as unknown as Record<string, (...x: unknown[]) => unknown>)[f as string]!(...(a as unknown[])) as never, [fn, args] as const) as Promise<T>;
}
const waitFrames = (page: Page, n = 4) => page.evaluate((k) => new Promise<void>((res) => { let i = 0; const f = () => (++i >= k ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

let errors: string[] = [];
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => !!(window as unknown as W).__mines)).toBe(true);
  await page.locator('#intro [data-act=close]').click().catch(() => undefined);
  await page.locator('#btn-plane').click();
  await expect.poll(async () => (await st(page)).active).toBe(true);
  await page.waitForTimeout(1200);
});
test.afterEach(() => {
  expect(errors).toEqual([]);
});

test('arrive at 1: the seed stone, the road ahead, and the budget', async ({ page }) => {
  await expect(page.locator('#plane-hud')).toBeVisible();
  await expect(page.locator('#pl-name')).toHaveText('The road of integers');
  await expect(page.locator('#pl-text')).toContainText('built from primes in exactly one way');
  await expect(page.locator('#pl-draft')).toBeVisible();
  expect((await st(page)).stop).toBe('road');
  await shot(page, 'plane-1-arrive');
  const info = await page.evaluate(() => ({ ...(window as unknown as W).__mines.renderer.info.render }));
  expect(info.calls).toBeLessThan(100);
  expect(info.triangles).toBeLessThan(500_000);
});

test('walk the road: look at columns and read what they are made of', async ({ page }) => {
  const data = await page.evaluate(() => (window as unknown as W).__mines.plane.internals.data);
  const colAt = (n: number) => data.road.columns[n - 1]!;
  // Stand a few metres off the road beside column 12, and look at it.
  const stand = async (n: number) => {
    const c = colAt(n);
    // 3 m to the left of the road at that column
    await call(page, 'place', c.pos[0] + Math.cos(c.yaw) * 2.6, c.pos[2] - Math.sin(c.yaw) * 2.6);
    await call(page, 'lookAt', 'road', n);
    await waitFrames(page, 3);
  };
  for (const [n, label, threads] of [[12, '12 = 2² · 3', 3], [64, '64 = 2⁶', 6], [96, '96 = 2⁵ · 3', 6], [13, '13 is prime', 0]] as const) {
    await stand(n);
    const s = await st(page);
    expect(s.focus).toEqual({ kind: 'road', n });
    expect(s.threads).toBe(threads);
    await expect(page.locator('#pl-focus')).toHaveText(label);
  }
  await stand(12);
  await page.waitForTimeout(600);
  await shot(page, 'plane-2-road');
  await stand(64);
  await page.waitForTimeout(600);
  await shot(page, 'plane-3-focus');
  // The number written above a column is the pipeline's; the HUD shows exactly the descriptor's label.
  for (const n of [1, 30, 97, 100]) {
    await stand(n === 1 ? 2 : n);
  }
  const labels = await call<string[]>(page, 'labelsOf');
  expect(labels[0]).toBe('1 has no prime factors');
  expect(labels).toHaveLength(100);
});

test('W walks you forward, and the walk stays on the road', async ({ page }) => {
  const before = (await st(page)).pos as [number, number];
  await page.keyboard.down('KeyW');
  // Hold the key until a frame has taken a step; SwiftShader can be slow to draw one.
  await expect.poll(async () => { const p = (await st(page)).pos as [number, number]; return Math.hypot(p[0] - before[0], p[1] - before[1]); }, { timeout: 20_000 }).toBeGreaterThan(0.3);
  await page.keyboard.up('KeyW');
});

const settled = (page: Page) => expect.poll(async () => (await st(page)).sieve?.animating, { timeout: 60_000 }).toBe(false);
const survivors = (page: Page) => page.evaluate(() => (window as unknown as W).__mines.plane.internals.data.plaza.survivors);

test('the sieve plaza: strike, crumble, survive, reset', async ({ page }) => {
  await call(page, 'jump', 'plaza');
  await waitFrames(page, 3);
  expect((await st(page)).zone).toBe('plaza');
  await expect(page.locator('#pl-sieve')).toBeVisible();
  await expect(page.locator('#pl-count')).toHaveText('99 of 99 standing');
  await page.waitForTimeout(800);
  await shot(page, 'plane-4-plaza');

  // A real click on a plaza column strikes it: look at 92 (nearest row), hover, click.
  await call(page, 'lookAt', 'plaza', 92);
  await waitFrames(page, 3); // the new view reaches the camera on the next frame
  const at = await call<{ x: number; y: number }>(page, 'screenOf', 'plaza', 92);
  await page.mouse.move(at.x, at.y);
  await expect.poll(async () => (await st(page)).focus, { timeout: 20_000 }).toEqual({ kind: 'plaza', n: 92 });
  await page.mouse.click(at.x, at.y);
  await expect.poll(async () => (await st(page)).sieve?.struck).toEqual([92]);
  expect((await st(page)).sieve?.standing).toHaveLength(99); // nothing is a multiple of 92 up to 100

  // Strike 2: its multiples crumble. 92 itself is one of them.
  const fell = await call<number[]>(page, 'strike', 2);
  expect(fell).toHaveLength(49);
  expect(fell).toContain(92);
  await page.waitForTimeout(2500);
  await shot(page, 'plane-5-sieve-mid');
  // A crumbled number cannot be struck, and a second strike on a standing number does nothing.
  expect(await call(page, 'strike', 4)).toBeNull();
  expect(await call(page, 'strike', 92)).toBeNull();
  expect(await call(page, 'strike', 2)).toEqual([]); // 2 still stands; striking it again knocks nothing more down
  expect(await call(page, 'strike', 1)).toBeNull();

  // 3, 5 and 7 finish the job; after them, nothing else knocks anything down.
  for (const n of [3, 5, 7]) await call(page, 'strike', n);
  await settled(page);
  const s = (await st(page)).sieve!;
  expect(s.standing).toEqual(await survivors(page));
  expect(s.standing).toHaveLength(25);
  expect(s.done).toBe(true);
  await expect(page.locator('#pl-count')).toHaveText('25 of 99 standing');
  await expect(page.locator('#pl-note')).toBeVisible();
  await expect(page.locator('#pl-note-text')).toContainText('2, 3, 5 and 7');
  await expect(page.locator('#pl-note-text')).toContainText('square root of 100');
  await expect(page.locator('#pl-note-draft')).toBeVisible();
  expect(await call(page, 'strike', 11)).toEqual([]);
  await page.waitForTimeout(1000);
  await shot(page, 'plane-6-survivors');

  // Reset restores the grid, mid-animation too.
  await call(page, 'strike', 2);
  await call(page, 'reset');
  await expect(page.locator('#pl-count')).toHaveText('99 of 99 standing');
  expect((await st(page)).sieve?.struck).toEqual([]);
  await page.locator('#pl-reset').click();
  expect((await st(page)).sieve?.standing).toHaveLength(99);
});

test('the sieve leaves the 25 primes from any strike order', async ({ page }) => {
  await call(page, 'jump', 'plaza');
  const result = await page.evaluate(() => {
    const p = (window as unknown as W).__mines.plane;
    const want = p.internals.data.plaza.survivors.join();
    let seed = 99;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    const out: boolean[] = [];
    for (let round = 0; round < 25; round++) {
      p.reset();
      const nums = Array.from({ length: 99 }, (_, i) => i + 2).sort(() => rnd() - 0.5);
      for (const n of nums) p.strike(n); // skips whatever has already crumbled
      for (const n of p.state.sieve!.standing) p.strike(n);
      out.push(p.state.sieve!.standing.join() === want);
    }
    p.reset();
    return out;
  });
  expect(result.every(Boolean)).toBe(true);
});

test('the overlook: both curves and the ratio at the marker', async ({ page }) => {
  const data = await page.evaluate(() => (window as unknown as W).__mines.plane.internals.data);
  const ov = data.overlook;
  const along = (s: number) => [ov.scale.origin[0] + Math.sin(ov.scale.yaw) * s, ov.scale.origin[2] + Math.cos(ov.scale.yaw) * s] as const;
  await call(page, 'jump', 'overlook');
  await call(page, 'face', ov.scale.yaw, 0.1);
  await waitFrames(page, 3);
  let s = await st(page);
  expect(s.zone).toBe('overlook');
  expect(s.marker).toMatchObject({ x: 100, pi: 25 });
  await expect(page.locator('#pl-readout')).toContainText('π(x) = 25');
  await page.waitForTimeout(1000);
  await shot(page, 'plane-7-overlook');

  // The far end: 78,498 primes against about 72,382, a ratio of 1.084.
  const [x, z] = along(241); // a metre past the last sample, still on the road
  await call(page, 'place', x, z);
  await waitFrames(page, 3);
  s = await st(page);
  expect(s.marker).toMatchObject({ x: 1_000_000, pi: 78498 });
  await expect(page.locator('#pl-readout')).toContainText('x = 1,000,000');
  await expect(page.locator('#pl-readout')).toContainText('π(x) = 78,498');
  await expect(page.locator('#pl-readout')).toContainText('x / ln x ≈ 72,382');
  await expect(page.locator('#pl-readout')).toContainText('ratio 1.084');
  await page.waitForTimeout(800);
  await shot(page, 'plane-8-marker-end');

  // Just before the start it clamps to the first sample; off the road there is no marker.
  const [bx, bz] = along(-3);
  await call(page, 'place', bx, bz);
  await waitFrames(page, 3);
  expect((await st(page)).marker).toMatchObject({ x: 100 });
  await call(page, 'place', ...along(0).map((v, i) => v + (i === 0 ? Math.cos(ov.scale.yaw) : -Math.sin(ov.scale.yaw)) * 3.5) as [number, number]);
  await waitFrames(page, 3);
  expect((await st(page)).marker).not.toBeNull(); // still on the road's width
  const info = await page.evaluate(() => ({ ...(window as unknown as W).__mines.renderer.info.render }));
  expect(info.calls).toBeLessThan(100);
  expect(info.triangles).toBeLessThan(500_000);
});

test('travel: a key takes you to a stop, eased, and nothing moves you unasked', async ({ page }) => {
  test.setTimeout(240_000);
  const before = (await st(page)).pos;
  await page.waitForTimeout(1500);
  expect((await st(page)).pos).toEqual(before); // standing still: the camera does not drift
  await page.keyboard.press('Digit3');
  await expect.poll(async () => (await st(page)).travelling).toBe(true);
  // Mid-move the horizon stays level: pitch only eases toward the stop's, and there is no roll.
  const mid = await page.evaluate(() => {
    const m = (window as unknown as { __mines: { plane: { rig: { rotation: { x: number; z: number } }; camera: { rotation: { z: number } } } } }).__mines.plane;
    return { rigRoll: m.rig.rotation.z, camRoll: m.camera.rotation.z };
  });
  expect(mid).toEqual({ rigRoll: 0, camRoll: 0 });
  await expect.poll(async () => (await st(page)).travelling, { timeout: 200_000 }).toBe(false);
  const s = await st(page);
  expect(s.stop).toBe('overlook');
  expect(s.zone).toBe('overlook');
  expect(s.marker).toMatchObject({ x: 100 });
});
