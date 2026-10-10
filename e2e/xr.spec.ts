import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';

/**
 * The Inside view in a headset, on an emulated Meta Quest 3 (IWER, Meta's WebXR emulator):
 * enter VR, snap turn in 30-degree steps, teleport on the floor, and point at a doorway for a
 * guided tunnel move with a vignette that arrives in the next chamber.
 */
const iwer = readFileSync(createRequire(import.meta.url).resolve('iwer/build/iwer.min.js'), 'utf8');
type W = {
  __dev: { controllers: { right: { position: { set(x: number, y: number, z: number): void }; quaternion: { set(x: number, y: number, z: number, w: number): void }; updateButtonValue(id: string, v: number): void; updateAxes(id: string, x: number, y: number): void } } };
  __mines: {
    inside: {
      active: boolean;
      state: { chamber: string | null; guided: boolean };
      xr: { active: boolean; yaw: number; vignette: number; target: boolean };
      doors(): { yaw: number; target: string; pos: [number, number, number] }[];
      where(): [number, number, number] | null;
    };
  };
};
const ev = <T>(page: Page, fn: () => T) => page.evaluate(fn);

test.skip(({ browserName }) => browserName !== 'chromium');
test.use({ viewport: { width: 1200, height: 800 } });

test('headset: enter, snap turn, teleport, guided tunnel travel', async ({ page }) => {
  test.setTimeout(240_000);
  await page.addInitScript(`${iwer};window.__dev = new IWER.XRDevice(IWER.metaQuest3); window.__dev.installRuntime({ forceInstall: true });`);
  await page.goto('/#/n/sqrt2irr');
  await expect.poll(() => ev(page, () => !!(window as unknown as W).__mines)).toBe(true);
  await page.locator('#panel [data-act=enter]').click();
  await expect.poll(() => ev(page, () => (window as unknown as W).__mines.inside.state.chamber)).toBe('sqrt2irr');
  await expect(page.locator('#ih-vr')).toBeVisible();
  await page.locator('#ih-vr').click();
  await expect.poll(() => ev(page, () => (window as unknown as W).__mines.inside.xr.active)).toBe(true);
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `e2e/output/${test.info().project.name}-xr-1-chamber.png` });

  // Snap turn: one flick, one 30-degree step.
  const y0 = await ev(page, () => (window as unknown as W).__mines.inside.xr.yaw);
  await ev(page, () => (window as unknown as W).__dev.controllers.right.updateAxes('thumbstick', 0.95, 0));
  await page.waitForTimeout(400);
  await ev(page, () => (window as unknown as W).__dev.controllers.right.updateAxes('thumbstick', 0, 0));
  await page.waitForTimeout(200);
  const y1 = await ev(page, () => (window as unknown as W).__mines.inside.xr.yaw);
  expect(y1 - y0).toBeCloseTo(-Math.PI / 6, 5);

  // Aim the right controller from `from` (in the rig's frame) at a point given in the chamber's frame.
  const aim = (from: [number, number, number], world: [number, number, number]) =>
    page.evaluate(
      ([f, w]) => {
        const m = (window as unknown as W).__mines.inside;
        const [rx, , rz] = m.where() as [number, number, number];
        const yaw = m.xr.yaw;
        // Into the rig's frame: undo its position, then its yaw.
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
      [from, world] as [[number, number, number], [number, number, number]],
    );
  const pull = async () => {
    await ev(page, () => (window as unknown as W).__dev.controllers.right.updateButtonValue('trigger', 1));
    await page.waitForTimeout(250);
    await ev(page, () => (window as unknown as W).__dev.controllers.right.updateButtonValue('trigger', 0));
    await page.waitForTimeout(300);
  };

  // Teleport: two metres toward the middle of the chamber.
  const before = (await ev(page, () => (window as unknown as W).__mines.inside.where())) as [number, number, number];
  const spot: [number, number, number] = [before[0] * 0.4, 0, before[2] * 0.4];
  await aim([0.2, 1.3, -0.2], spot);
  await page.waitForTimeout(300);
  await pull();
  const after = (await ev(page, () => (window as unknown as W).__mines.inside.where())) as [number, number, number];
  expect(Math.hypot(after[0] - spot[0], after[2] - spot[2])).toBeLessThan(0.5);

  // A doorway: point at its opening and pull; a guided move with a vignette takes you through.
  const door = await ev(page, () => (window as unknown as W).__mines.inside.doors().find((d) => d.target === 'ltnr') as { pos: [number, number, number] });
  await aim([0.2, 1.3, -0.2], [door.pos[0], 1.4, door.pos[2]]);
  await page.waitForTimeout(300);
  await pull();
  await expect.poll(() => ev(page, () => (window as unknown as W).__mines.inside.state.guided)).toBe(true);
  const yawDuring = await ev(page, () => (window as unknown as W).__mines.inside.xr.yaw);
  await expect.poll(() => ev(page, () => (window as unknown as W).__mines.inside.xr.vignette)).toBeGreaterThan(0.3);
  await page.screenshot({ path: `e2e/output/${test.info().project.name}-xr-2-travel.png` });
  await expect.poll(() => ev(page, () => (window as unknown as W).__mines.inside.state.chamber), { timeout: 120_000 }).toBe('ltnr');
  // The view was never turned for us (the yaw only changes by the frame change on arrival).
  expect(await ev(page, () => (window as unknown as W).__mines.inside.state.guided)).toBe(false);
  expect(yawDuring).toBeCloseTo(y1, 5);
  expect(await ev(page, () => (window as unknown as W).__mines.inside.xr.vignette)).toBe(0);

  // B leaves the headset.
  await ev(page, () => (window as unknown as W).__dev.controllers.right.updateButtonValue('b-button', 1));
  await page.waitForTimeout(300);
  await ev(page, () => (window as unknown as W).__dev.controllers.right.updateButtonValue('b-button', 0));
  await expect.poll(() => ev(page, () => (window as unknown as W).__mines.inside.xr.active)).toBe(false);
});
