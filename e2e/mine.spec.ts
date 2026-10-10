import { expect, test, type Page } from '@playwright/test';

/**
 * Desktop mode, end to end: the mine loads within budget, a theorem can be found, selected and
 * traced to the axioms, and each control does what it says. Screenshots go to e2e/output/ for a
 * look by eye.
 */
interface Hook {
  graph: { ancestors(id: string): Set<string>; descendants(id: string): Set<string>; pathToAxiom(id: string): string[] };
  store: { view: { selected: string | null; mode: string; lit: Set<string> } };
  renderer: { info: { render: { calls: number; triangles: number } } };
}
const hook = (page: Page) => page.evaluate(() => (window as unknown as { __mines: Hook }).__mines !== undefined);
const view = (page: Page) =>
  page.evaluate(() => {
    const m = (window as unknown as { __mines: Hook }).__mines;
    return { selected: m.store.view.selected, mode: m.store.view.mode, lit: m.store.view.lit.size };
  });
const shot = (page: Page, name: string) => page.screenshot({ path: `e2e/output/${test.info().project.name}-${name}.png` });

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  (page as unknown as { errors: string[] }).errors = errors;
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/');
  await expect.poll(() => hook(page)).toBe(true);
  await page.waitForTimeout(1500);
});

test('loads the whole mine within the draw-call budget', async ({ page }) => {
  await expect(page.locator('#intro')).toBeVisible();
  await expect(page.locator('#counts')).toContainText('landmarks');
  await shot(page, '1-mine');
  const info = await page.evaluate(() => {
    const r = (window as unknown as { __mines: Hook }).__mines.renderer.info.render;
    return { calls: r.calls, triangles: r.triangles };
  });
  expect(info.calls).toBeLessThan(100);
  expect(info.triangles).toBeLessThan(500_000);
  expect((page as unknown as { errors: string[] }).errors).toEqual([]);
});

test('find a theorem and trace it to the axioms', async ({ page }) => {
  await page.locator('#intro [data-act=close]').click();
  await page.locator('#search').fill('square root of 2');
  await expect(page.locator('#results li').first()).toContainText('irrational');
  await page.locator('#search').press('Enter');
  await expect(page.locator('#panel h2')).toHaveText('The square root of 2 is irrational');
  await expect(page.locator('#panel .statement svg')).toBeVisible();
  await expect(page).toHaveURL(/#\/n\/sqrt2irr$/);
  const up = await page.evaluate(() => (window as unknown as { __mines: Hook }).__mines.graph.ancestors('sqrt2irr').size);
  expect(await view(page)).toEqual({ selected: 'sqrt2irr', mode: 'up', lit: up });
  await page.waitForTimeout(1200);
  await shot(page, '2-traced');

  // Trace down instead.
  await page.locator('#panel [data-mode=down]').click();
  const downN = await page.evaluate(() => (window as unknown as { __mines: Hook }).__mines.graph.descendants('sqrt2irr').size);
  expect((await view(page)).lit).toBe(downN);

  // Follow: one step up toward the axioms.
  await page.locator('#panel [data-mode=up]').click();
  const route = await page.evaluate(() => (window as unknown as { __mines: Hook }).__mines.graph.pathToAxiom('sqrt2irr'));
  await page.locator('#panel .step').click();
  expect((await view(page)).selected).toBe(route[1]);
  await page.keyboard.press('Escape');
  expect((await view(page)).selected).toBe(null);
  expect((page as unknown as { errors: string[] }).errors).toEqual([]);
});

test('a link to a node opens it', async ({ page }) => {
  await page.goto('/#/n/fta');
  await expect.poll(() => hook(page)).toBe(true);
  await expect(page.locator('#panel h2')).toHaveText('Fundamental theorem of algebra');
  await page.waitForTimeout(1500);
  await shot(page, '3-fta');
});

test('clicking a crystal selects it', async ({ page }) => {
  await page.locator('#intro [data-act=close]').click();
  // Aim at the crystal with the most room around it on screen, clear of the top bar.
  const target = await page.evaluate(() => {
    type V = { project(c: unknown): { x: number; y: number; z: number } };
    const m = (window as unknown as { __mines: { graph: { nodes: { id: string }[] }; mine: { position(id: string): V }; camera: unknown } }).__mines;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const pts = m.graph.nodes
      .map((n) => {
        const v = m.mine.position(n.id).project(m.camera);
        return { id: n.id, x: ((v.x + 1) / 2) * W, y: ((1 - v.y) / 2) * H, z: v.z };
      })
      .filter((p) => p.z > -1 && p.z < 1 && p.x > 20 && p.x < W - 20 && p.y > 140 && p.y < H - 40);
    let best = pts[0] as (typeof pts)[number];
    let room = -1;
    for (const p of pts) {
      const near = Math.min(...pts.filter((q) => q !== p).map((q) => Math.hypot(q.x - p.x, q.y - p.y)));
      if (near > room) {
        room = near;
        best = p;
      }
    }
    return best;
  });
  await page.mouse.click(target.x, target.y);
  expect((await view(page)).selected).toBe(target.id);
});

test('statements: readable by default, formal on request, never wider than the panel', async ({ page }) => {
  for (const id of ['pnt', 'cramer', 'ax-mp', 'ramsey']) {
    await page.evaluate((x) => (window as unknown as { __mines: { store: { select(id: string): void } } }).__mines.store.select(x), id);
    await expect(page.locator('#panel .statement svg')).toBeVisible();
    const fits = await page.locator('#panel .statement').evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
    expect(fits, `${id} statement fits`).toBe(true);
  }
  await page.evaluate(() => (window as unknown as { __mines: { store: { select(id: string): void } } }).__mines.store.select('pnt'));
  await expect(page.locator('#panel .draft')).toBeVisible();
  await page.waitForTimeout(1200);
  await shot(page, '4-pnt-readable');
  await page.locator('#panel [data-form=formal]').click();
  await expect(page.locator('#panel .source code')).toContainText('ppi');
  await expect(page.locator('#panel .draft')).toHaveCount(0);
  await shot(page, '5-pnt-formal');
  await page.locator('#panel [data-form=readable]').click();
});

test('names with math are typeset in lists', async ({ page }) => {
  await page.locator('#intro [data-act=close]').click();
  await page.locator('#search').fill('euler');
  await expect(page.locator('#results li .katex').first()).toBeVisible();
  await shot(page, '6-search-katex');
  await page.locator('#search').press('Escape');
  await page.evaluate(() => (window as unknown as { __mines: { store: { select(id: string): void } } }).__mines.store.select('efipi'));
  await expect(page.locator('#panel h2 .katex')).toBeVisible();
  await page.waitForTimeout(1200);
  await shot(page, '7-efipi');
});
