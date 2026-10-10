import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';

/**
 * The number theory plane in a headset, on an emulated Meta Quest 3 (IWER): enter VR, snap turn
 * in 30-degree steps, teleport on the floor, strike a plaza column with the trigger, and travel
 * to the next stop with button A (guided, with a vignette, never turning the view). The project
 * config runs this file with the other headset test (the name ends in xr.spec.ts).
 */
const iwer = readFileSync(createRequire(import.meta.url).resolve('iwer/build/iwer.min.js'), 'utf8');
type Vec = [number, number, number];
type W = {
  __dev: { controllers: { right: { position: { set(x: number, y: number, z: number): void }; quaternion: { set(x: number, y: number, z: number, w: number): void }; updateButtonValue(id: string, v: number): void; updateAxes(id: string, x: number, y: number): void } } };
  __mines: {
    plane: {
      state: { active: boolean; zone: string | null; pos: [number, number] | null; stop: string | null; travelling: boolean; focus: { kind: string; n: number } | null; sieve: { struck: number[]; standing: number[] } | null };
      xr: { active: boolean; heading: number; vignette: number; target: boolean; aim: 'column' | 'floor' | null };
      internals: { data: { plaza: { grid: { n: number; pos: Vec }[] } } };
      jump(id: string): void;
      strike(n: number): number[] | null;
    };
  };
};
const ev = <T>(page: Page, fn: () => T) => page.evaluate(fn);
const shot = (page: Page, name: string) => page.screenshot({ path: `e2e/output/${test.info().project.name}-${name}.png` });

test.skip(({ browserName }) => browserName !== 'chromium');
test.use({ viewport: { width: 1200, height: 800 } });

test('plane in a headset: snap turn, teleport, strike with the trigger, travel with A', async ({ page }) => {
  test.setTimeout(420_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(`${iwer};window.__dev = new IWER.XRDevice(IWER.metaQuest3); window.__dev.installRuntime({ forceInstall: true });`);
  await page.goto('/');
  await expect.poll(() => ev(page, () => !!(window as unknown as W).__mines)).toBe(true);
  await page.locator('#btn-plane').click();
  await expect.poll(() => ev(page, () => (window as unknown as W).__mines.plane.state.active)).toBe(true);
  await expect(page.locator('#pl-vr')).toBeVisible();
  await page.locator('#pl-vr').click();
  await expect.poll(() => ev(page, () => (window as unknown as W).__mines.plane.xr.active)).toBe(true);
  await page.waitForTimeout(1000);
  await shot(page, 'plane-xr-1-road');

  // Snap turn: hold the stick until a frame takes the one 30-degree step, then release.
  const h0 = await ev(page, () => (window as unknown as W).__mines.plane.xr.heading);
  await ev(page, () => (window as unknown as W).__dev.controllers.right.updateAxes('thumbstick', 0.95, 0));
  await expect.poll(async () => (await ev(page, () => (window as unknown as W).__mines.plane.xr.heading)) - h0, { timeout: 30_000 }).toBeCloseTo(-Math.PI / 6, 5);
  await ev(page, () => (window as unknown as W).__dev.controllers.right.updateAxes('thumbstick', 0, 0));
  await expect.poll(async () => (await ev(page, () => (window as unknown as W).__mines.plane.xr.heading)) - h0, { timeout: 30_000 }).toBeCloseTo(-Math.PI / 6, 5);
  const h1 = await ev(page, () => (window as unknown as W).__mines.plane.xr.heading);

  // Aim the right controller from `from` (in the rig's frame) at a world point on the plane.
  const aim = (from: Vec, world: Vec) =>
    page.evaluate(
      ([f, w]) => {
        const m = (window as unknown as W).__mines.plane;
        const [rx, rz] = m.state.pos as [number, number];
        const yaw = m.xr.heading + Math.PI; // the rig turns by heading + π
        const dx = w[0] - rx;
        const dz = w[2] - rz;
        const lx = dx * Math.cos(yaw) - dz * Math.sin(yaw);
        const lz = dx * Math.sin(yaw) + dz * Math.cos(yaw);
        const vx = lx - f[0];
        const vy = w[1] - f[1];
        const vz = lz - f[2];
        const n = Math.hypot(vx, vy, vz);
        const [ux, uy, uz] = [vx / n, vy / n, vz / n];
        // The rotation taking -Z onto u: axis (-Z) x u, angle between them.
        const [ax, ay] = [uy, -ux];
        const sin = Math.hypot(ax, ay);
        const ang = Math.atan2(sin, -uz);
        const [kx, ky] = sin > 1e-9 ? [ax / sin, ay / sin] : [1, 0];
        const h = Math.sin(ang / 2);
        const c = (window as unknown as W).__dev.controllers.right;
        c.position.set(f[0], f[1], f[2]);
        c.quaternion.set(kx * h, ky * h, 0, Math.cos(ang / 2));
      },
      [from, world] as [Vec, Vec],
    );
  const pull = async (kind: 'floor' | 'column') => {
    await expect.poll(() => ev(page, () => (window as unknown as W).__mines.plane.xr.aim), { timeout: 30_000 }).toBe(kind);
    await ev(page, () => (window as unknown as W).__dev.controllers.right.updateButtonValue('trigger', 1));
    await expect.poll(() => ev(page, () => (window as unknown as W).__mines.plane.xr.aim), { timeout: 30_000 }).toBe(kind);
    await ev(page, () => (window as unknown as W).__dev.controllers.right.updateButtonValue('trigger', 0));
  };

  // Teleport: three metres ahead of where we stand, on the floor.
  const before = (await ev(page, () => (window as unknown as W).__mines.plane.state.pos)) as [number, number];
  const ahead: Vec = [before[0] + Math.sin(h1) * 3, 0, before[1] + Math.cos(h1) * 3];
  await aim([0.2, 1.3, -0.2], ahead);
  await pull('floor');
  await expect
    .poll(async () => {
      const p = (await ev(page, () => (window as unknown as W).__mines.plane.state.pos)) as [number, number];
      return Math.hypot(p[0] - ahead[0], p[1] - ahead[2]);
    })
    .toBeLessThan(0.5);
  expect(await ev(page, () => (window as unknown as W).__mines.plane.xr.heading)).toBeCloseTo(h1, 5); // teleport never turns you

  // A: guided travel to the next stop (the plaza), with a vignette and without turning the view.
  await ev(page, () => (window as unknown as W).__dev.controllers.right.updateButtonValue('a-button', 1));
  await expect.poll(() => ev(page, () => (window as unknown as W).__mines.plane.state.travelling), { timeout: 30_000 }).toBe(true);
  await ev(page, () => (window as unknown as W).__dev.controllers.right.updateButtonValue('a-button', 0));
  await expect.poll(() => ev(page, () => (window as unknown as W).__mines.plane.xr.vignette)).toBeGreaterThan(0.3);
  const during = await ev(page, () => (window as unknown as W).__mines.plane.xr.heading);
  expect(during).toBeCloseTo(h1, 5);
  await page.screenshot({ path: `e2e/output/${test.info().project.name}-plane-xr-2-travel.png` });
  await expect.poll(() => ev(page, () => (window as unknown as W).__mines.plane.state.travelling), { timeout: 360_000 }).toBe(false);
  expect(await ev(page, () => (window as unknown as W).__mines.plane.state.stop)).toBe('plaza');
  expect(await ev(page, () => (window as unknown as W).__mines.plane.xr.heading)).toBeCloseTo(h1, 5);
  expect(await ev(page, () => (window as unknown as W).__mines.plane.xr.vignette)).toBe(0);

  // The trigger strikes the plaza column it points at: the one nearest us, 92.
  const cell = await page.evaluate(() => (window as unknown as W).__mines.plane.internals.data.plaza.grid.find((c) => c.n === 92)!.pos);
  await aim([0.2, 1.3, -0.2], [cell[0], 0.7, cell[2]]);
  await pull('column');
  await expect.poll(() => ev(page, () => (window as unknown as W).__mines.plane.state.sieve?.struck)).toEqual([92]);
  expect(await ev(page, () => (window as unknown as W).__mines.plane.strike(2))).toContain(92); // the rest of the sieve plays on
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `e2e/output/${test.info().project.name}-plane-xr-3-plaza.png` });

  // B leaves the headset.
  await ev(page, () => (window as unknown as W).__dev.controllers.right.updateButtonValue('b-button', 1));
  await expect.poll(() => ev(page, () => (window as unknown as W).__mines.plane.xr.active), { timeout: 30_000 }).toBe(false);
  await ev(page, () => (window as unknown as W).__dev.controllers.right.updateButtonValue('b-button', 0));
  expect(errors).toEqual([]);
});
