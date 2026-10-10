import { expect, test, type Page } from '@playwright/test';

/**
 * The Inside view, end to end on the desktop: enter a chamber from the map, walk through a
 * doorway and down its tunnel into the next chamber, take a guided Journey step, and go back to
 * the map. Locality and the draw-call budget are checked on the way.
 */
interface Inside {
  active: boolean;
  state: { chamber: string | null; drawn: string[]; inTunnel: string | null; guided: boolean; journey: { path: string[]; at: number } | null };
  doors(): { yaw: number; target: string; dir: string; pos: [number, number, number] }[];
  where(): [number, number, number] | null;
  face(h: number, p?: number): void;
  walk(dx: number, dz: number): void;
  stepAlong(d: number): void;
}
type W = { __mines: { inside: Inside; renderer: { info: { render: { calls: number; triangles: number }; memory: { geometries: number; textures: number } } }; graph: { must(id: string): { deps: string[] }; dependentsOf(id: string): string[] }; store: { view: { selected: string | null } } } };
const st = (page: Page) => page.evaluate(() => (window as unknown as W).__mines.inside.state);
const shot = (page: Page, name: string) => page.screenshot({ path: `e2e/output/${test.info().project.name}-${name}.png` });

test.beforeEach(async ({ page }) => {
  await page.goto('/#/n/sqrt2irr');
  await expect.poll(() => page.evaluate(() => !!(window as unknown as W).__mines)).toBe(true);
});

test('enter a chamber: only the local subgraph is drawn, within budget', async ({ page }) => {
  await page.locator('#panel [data-act=enter]').click();
  await expect.poll(async () => (await st(page)).chamber).toBe('sqrt2irr');
  await expect(page.locator('#inside-hud')).toBeVisible();
  await expect(page.locator('#ih-name')).toHaveText('The square root of 2 is irrational');
  await page.waitForTimeout(2500);
  const { drawn } = await st(page);
  const neighbours = await page.evaluate(() => {
    const g = (window as unknown as W).__mines.graph;
    return [...g.must('sqrt2irr').deps, ...g.dependentsOf('sqrt2irr')];
  });
  expect(drawn.sort()).toEqual(['sqrt2irr', ...neighbours].sort());
  const info = await page.evaluate(() => ({ ...(window as unknown as W).__mines.renderer.info.render }));
  expect(info.calls).toBeLessThan(100);
  expect(info.triangles).toBeLessThan(500_000);
  await shot(page, 'inside-1-chamber');
  await page.locator('#ih-map').click();
  await expect(page.locator('#inside-hud')).toBeHidden();
  expect(await page.evaluate(() => (window as unknown as W).__mines.store.view.selected)).toBe('sqrt2irr');
});

test('walk through a doorway, down the tunnel, into the next chamber', async ({ page }) => {
  await page.locator('#panel [data-act=enter]').click();
  await expect.poll(async () => (await st(page)).chamber).toBe('sqrt2irr');
  const door = await page.evaluate(() => (window as unknown as W).__mines.inside.doors().find((d) => d.target === 'nnssre'));
  expect(door).toBeTruthy();
  // Head for the doorway, steering toward it each step (round any pillar in the way).
  await page.evaluate((d) => {
    const i = (window as unknown as W).__mines.inside;
    i.face(d.yaw, 0);
    for (let k = 0; k < 600 && !i.state.inTunnel; k++) {
      const [x, , z] = i.where() as [number, number, number];
      const dx = d.pos[0] - x;
      const dz = d.pos[2] - z;
      const len = Math.hypot(dx, dz) || 1;
      i.walk((dx / len) * 0.2, (dz / len) * 0.2);
    }
  }, door as { yaw: number; pos: [number, number, number] });
  expect((await st(page)).inTunnel).toBe('sqrt2irr>nnssre');
  // Inside a tunnel only its destination is drawn besides the chamber you came from. The switch
  // happens on the next frame, which SwiftShader can take longer than a fixed sleep to draw.
  await expect.poll(async () => (await st(page)).drawn.sort()).toEqual(['nnssre', 'sqrt2irr']);
  await page.waitForTimeout(1500);
  await shot(page, 'inside-2-tunnel');
  // Keep walking forward along the tunnel until the far chamber is reached.
  await page.evaluate(() => {
    const i = (window as unknown as W).__mines.inside;
    for (let k = 0; k < 4000 && i.state.inTunnel; k++) i.stepAlong(0.5);
  });
  await expect.poll(async () => (await st(page)).chamber, { timeout: 30_000 }).toBe('nnssre');
  await page.waitForTimeout(2000);
  await shot(page, 'inside-3-arrived');
});

test('journey: from the axioms, chamber by chamber, guided', async ({ page }) => {
  await page.locator('#panel [data-act=journey]').click();
  await expect.poll(async () => (await st(page)).journey?.at).toBe(0);
  const first = await st(page);
  expect(first.chamber).toBe(first.journey?.path[0]);
  expect(first.journey?.path.at(-1)).toBe('sqrt2irr');
  await expect(page.locator('#ih-jtext')).toContainText('chamber 1 of');
  await page.waitForTimeout(1500);
  await shot(page, 'inside-4-journey-start');
  await page.locator('#ih-next').click();
  await expect.poll(async () => (await st(page)).guided).toBe(true);
  await page.waitForTimeout(1500);
  await shot(page, 'inside-5-journey-guided');
  await expect.poll(async () => (await st(page)).journey?.at, { timeout: 60_000 }).toBe(1);
  const second = await st(page);
  expect(second.chamber).toBe(second.journey?.path[1]);
  expect(second.guided).toBe(false);
});

test('leaving a chamber frees its meshes: entering again does not grow GPU memory', async ({ page }) => {
  const geometries = () => page.evaluate(() => (window as unknown as W).__mines.renderer.info.memory.geometries);
  const visit = async () => {
    await page.locator('#panel [data-act=enter]').click();
    await expect.poll(async () => (await st(page)).chamber).toBe('sqrt2irr');
    await page.waitForTimeout(1500);
    await page.locator('#ih-map').click();
    await expect(page.locator('#inside-hud')).toBeHidden();
    await page.waitForTimeout(500);
  };
  await visit();
  const after1 = await geometries();
  await visit();
  await visit();
  expect(await geometries()).toBe(after1);
});
