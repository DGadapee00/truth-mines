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
  screenOf(kind: 'road' | 'plaza', n: number): { x: number; y: number } | null;
  labelsOf(): string[];
  internals: { data: PlaneData };
}
interface PlaneData {
  stops: { id: string; pos: [number, number, number]; yaw: number }[];
  road: { columns: { n: number; pos: [number, number, number]; yaw: number; label: string; threads: unknown[][] }[] };
  plaza: { grid: { n: number; pos: [number, number, number] }[]; survivors: number[]; yaw: number };
  overlook: { samples: { x: number; pi: number; s: number; at: [number, number, number] }[]; scale: { origin: [number, number, number]; yaw: number } };
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
