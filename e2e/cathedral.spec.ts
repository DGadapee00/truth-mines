/**
 * The cathedral prototype on the desktop (cathedral/, an IWSDK app), end to end: the threshold, the
 * hall with its twelve doors, the number theory plane, Trurl as captions, push-to-talk, and
 * progress that saves and resumes. The Worker is mocked (e2e/cathedral-helpers.ts): no real key
 * or network is involved. Needs `python -m pipeline` (data/) to have run.
 */
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { doorStates } from '../core/doors';
import { parseCathedral, parseGraph, parsePathways } from '../core/schema';
import { SECRET, WORKER, app, debug, enterSecret, mockWorker, open, settled, toCathedral, untilPhase } from './cathedral-helpers';

const data = (name: string): unknown => JSON.parse(readFileSync(new URL(`../data/${name}`, import.meta.url), 'utf8'));
const cathedral = parseCathedral(data('cathedral.json'));
const pathways = parsePathways(data('pathways.json'));
const graph = parseGraph(data('graph.json'));
const door = (plane: string) => cathedral.doors.find((d) => d.plane === plane)!;

const shot = (page: Page, name: string) => page.screenshot({ path: `e2e/output/cathedral-${name}.png` });

/** The number of draw calls and triangles of the last frame, against CLAUDE.md's budgets. */
async function expectWithinBudgets(page: Page) {
  const { calls, triangles } = await app<{ calls: number; triangles: number }>(page, 'drawCalls()');
  expect(calls).toBeLessThan(100);
  expect(triangles).toBeLessThan(500_000);
}

test.describe('the threshold', () => {
  test('first visit: it plays in full, cannot be skipped, and ends on the dais facing Foundations', async ({ page }) => {
    await open(page);
    await page.click('#gate-nosecret');
    await expect(page.locator('#ready')).toBeVisible();
    await shot(page, '1-ready');
    await page.click('#begin');
    const began = Date.now();
    await expect(page.locator('#skip')).toBeHidden();
    await page.keyboard.press('Space');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1500);
    expect((await debug(page)).phase).toBe('threshold');
    await expect(page.locator('#skip')).toBeHidden();
    await shot(page, '2-threshold');
    await untilPhase(page, 'cathedral', 120_000);
    expect((Date.now() - began) / 1000, 'a visit that has not seen it plays all of it').toBeGreaterThanOrEqual(20);
    const d = await debug(page);
    expect(Math.hypot(d.pos[0], d.pos[2])).toBeLessThan(0.05);
    expect(d.pos[1]).toBeLessThan(0.2);
    expect(Math.abs(d.heading)).toBeLessThan(1e-6); // facing the far wall: Foundations
    expect(await page.evaluate(() => localStorage.getItem('truth-mines.threshold-seen'))).toBe('1');
    await page.waitForTimeout(500);
    await shot(page, '3-arrived');
    await expectWithinBudgets(page);
  });

  test('a return visit can skip: a press during the drift fades straight to the dais', async ({ page }) => {
    await open(page, { seen: true });
    await page.click('#gate-nosecret');
    await page.click('#begin');
    await expect(page.locator('#skip')).toBeVisible();
    const began = Date.now();
    await page.click('#skip');
    let peak = 0;
    await page.waitForFunction(() => (window as unknown as { __cathedral: { debug(): { fade: number } } }).__cathedral.debug().fade > 0.5, null, { timeout: 10_000 }).then(() => (peak = 1));
    expect(peak).toBe(1); // it fades; it does not cut
    await untilPhase(page, 'cathedral', 20_000);
    expect(Date.now() - began).toBeLessThan(15_000);
    const d = await debug(page);
    expect(Math.hypot(d.pos[0], d.pos[2])).toBeLessThan(0.05);
    expect(Math.abs(d.heading)).toBeLessThan(1e-6);
  });

  test('a device that blocks localStorage plays the full threshold and still works', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', { get: () => { throw new DOMException('blocked', 'SecurityError'); } });
    });
    await page.goto('/');
    await page.waitForFunction(() => !!(window as unknown as { __cathedral?: unknown }).__cathedral, null, { timeout: 60_000 });
    await page.click('#gate-nosecret');
    await page.click('#begin');
    await page.waitForTimeout(1000);
    await expect(page.locator('#skip')).toBeHidden();
    expect((await debug(page)).phase).toBe('threshold');
  });
});

test.describe('the cathedral', () => {
  test('twelve doors with the states the data computes; a dim or sealed door will not open', async ({ page }) => {
    await open(page, { seen: true });
    await page.click('#gate-nosecret');
    await toCathedral(page);
    const d = await debug(page);
    expect(d.states).toEqual(doorStates([], cathedral, pathways, graph));
    expect(Object.keys(d.states)).toHaveLength(12);
    expect(Object.entries(d.states).filter(([, s]) => s === 'frontier').map(([p]) => p)).toEqual(['number-theory']);
    await app(page, 'stand(0, -3)');
    await app(page, "lookAtDoor('sets')");
    await expect(page.locator('#door-label')).toContainText('dim');
    await app(page, "lookAtDoor('topology')");
    await expect(page.locator('#door-label')).toContainText('sealed');
    await app(page, "lookAtDoor('number-theory')");
    await expect(page.locator('#door-label')).toContainText('open');
    await shot(page, '4-number-theory-door');
    await app(page, "lookAtDoor('sets')");
    await expect(page.locator('#door-label')).toContainText('Sets'); // the visitor sees what they face before they press
    await page.keyboard.press('Enter');
    await expect(page.locator('#toast')).toContainText('not open to you yet');
    expect((await debug(page)).phase).toBe('cathedral');
    await expectWithinBudgets(page);
  });

  test('the visitor is never moved: standing still, nothing changes, and there is no smooth locomotion', async ({ page }) => {
    await open(page, { seen: true });
    await page.click('#gate-nosecret');
    await toCathedral(page);
    const a = await debug(page);
    await page.waitForTimeout(2000);
    const b = await debug(page);
    expect(b.pos).toEqual(a.pos);
    expect(b.heading).toBe(a.heading);
    // the policy: teleport and a 30 degree snap turn; the thumbstick slide and jumping are gone
    expect(b.slideRegistered).toBe(false);
    expect(b.locomotion).toEqual({ slidingSpeed: 0, turningAngle: 30, turningMethod: 1, enableJumping: false });
  });

  test('a door that lights but has no pathway built yet says so', async ({ page }) => {
    await open(page, { seen: true });
    await page.click('#gate-nosecret');
    await toCathedral(page);
    await page.evaluate(() => (window as unknown as { __cathedral: { store: { earn(ids: string[]): void } } }).__cathedral.store.earn(['1arith']));
    expect((await debug(page)).states['algebra-symmetry']).toBe('frontier');
    await app(page, 'stand(0, -3)');
    await app(page, "lookAtDoor('algebra-symmetry')");
    await expect(page.locator('#door-label')).toContainText('Algebra and symmetry: open');
    await page.keyboard.press('Enter');
    await expect(page.locator('#toast')).toContainText('nothing is built yet');
    expect((await debug(page)).phase).toBe('cathedral');
  });
});

test.describe('the number theory plane', () => {
  test('through the door: the sieve leaves exactly the primes from any strike order; leaving returns to the same door', async ({ page }) => {
    await open(page, { seen: true });
    await page.click('#gate-nosecret');
    await toCathedral(page);
    await app(page, 'stand(0, -3)');
    await app(page, "lookAtDoor('number-theory')");
    await expect(page.locator('#door-label')).toContainText('Number theory: open');
    await page.keyboard.press('Enter');
    await untilPhase(page, 'plane');
    await settled(page);
    await shot(page, '5-road');
    expect((await debug(page)).shown, 'behind the door only the plane is drawn').toEqual({ hall: false, vault: false, plane: true });
    expect((await debug(page)).standing).toBe(99);
    await expect(page.locator('#pl-name')).toContainText('road');
    await page.keyboard.press('Digit2');
    await page.waitForTimeout(500);
    await shot(page, '6-plaza');
    expect((await debug(page)).plazaInView, 'standing at the plaza, its columns are drawn').toBe(true);
    const primes = (await debug(page)).standing as number;
    expect(primes).toBe(99);
    // strike in a shuffled order until nothing more falls
    const order = [97, 4, 51, 2, 99, 3, 25, 7, 5, 11, 13, 50];
    for (const n of order) await app(page, `strikeInPlane(${n})`);
    await page.waitForTimeout(2500);
    expect((await debug(page)).standing).toBe(25);
    await expect(page.locator('#pl-count')).toContainText('25 of 99');
    await shot(page, '7-sieved');
    await page.click('#pl-reset');
    expect((await debug(page)).standing).toBe(99);
    await page.keyboard.press('Digit3');
    await page.waitForTimeout(500);
    await expect(page.locator('#pl-readout')).toContainText('π(x)');
    await shot(page, '8-overlook');
    await expectWithinBudgets(page);
    await page.click('#leave-plane');
    await untilPhase(page, 'cathedral');
    await settled(page);
    const d = await debug(page);
    expect(d.shown).toEqual({ hall: true, vault: true, plane: false });
    const stand = door('number-theory').stand;
    expect(d.pos[0]).toBeCloseTo(stand.pos[0], 1);
    expect(d.pos[2]).toBeCloseTo(stand.pos[2], 1);
    expect(d.heading).toBeCloseTo(stand.yaw, 3);
  });

  test('progress is saved per pathway: step out, reload, and jump straight back in where you were', async ({ page }) => {
    await open(page, { seen: true });
    await page.click('#gate-nosecret');
    await toCathedral(page);
    await app(page, 'stand(0, -3)');
    await app(page, "lookAtDoor('number-theory')");
    await expect(page.locator('#door-label')).toContainText('Number theory: open');
    await page.keyboard.press('Enter');
    await untilPhase(page, 'plane');
    await settled(page);
    await page.keyboard.press('Digit2');
    await page.waitForTimeout(300);
    const where = (await debug(page)).plane!;
    await page.keyboard.press('KeyM');
    await untilPhase(page, 'cathedral');
    await settled(page);
    await page.reload();
    await page.waitForFunction(() => !!(window as unknown as { __cathedral?: unknown }).__cathedral, null, { timeout: 60_000 });
    await page.click('#gate-nosecret');
    await toCathedral(page);
    await app(page, 'stand(0, -3)');
    await app(page, "lookAtDoor('number-theory')");
    await expect(page.locator('#door-label')).toContainText('Number theory: open');
    await page.keyboard.press('Enter');
    await untilPhase(page, 'plane');
    await settled(page);
    const back = (await debug(page)).plane!;
    expect(back.x).toBeCloseTo(where.x, 2);
    expect(back.z).toBeCloseTo(where.z, 2);
  });
});

test.describe('Trurl and the Worker', () => {
  test('the secret is entered once and kept off the page; Trurl answers in captions and the verdict lights the next door, through a reload', async ({ page }) => {
    const urls: string[] = [];
    page.on('request', (r) => urls.push(r.url()));
    const worker = await mockWorker(page, {
      reply: (u, body) => ({ text: ['Every number, ', 'one way only. ', 'Prove it to me.'], earned: body.moment === 'nt-1-road' && /prime/i.test(u) ? ['1arith'] : [] }),
    });
    await open(page, { seen: true });
    await enterSecret(page);
    await expect(page.locator('#ready')).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('truth-mines.secret'))).toBe(SECRET);
    expect(await page.evaluate(() => localStorage.getItem('truth-mines.worker'))).toBe(WORKER);
    await toCathedral(page);
    await app(page, 'stand(0, -3)');
    await app(page, "lookAtDoor('number-theory')");
    await expect(page.locator('#door-label')).toContainText('Number theory: open');
    await page.keyboard.press('Enter');
    await untilPhase(page, 'plane');
    await settled(page);
    await page.fill('#say-input', 'every number is a product of primes in exactly one way');
    await page.press('#say-input', 'Enter');
    await expect(page.locator('#captions')).toContainText('Prove it to me.');
    expect(worker.trurl).toHaveLength(1);
    expect(worker.trurl[0]).toMatchObject({ plane: 'number-theory', stretch: 'nt-1', moment: 'nt-1-road', landmark: '1arith', utterance: 'every number is a product of primes in exactly one way' });
    expect(Object.keys(worker.trurl[0]!).sort()).toEqual(['dialogue', 'earned', 'landmark', 'looking_at', 'moment', 'plane', 'schema_version', 'stretch', 'utterance']);
    await shot(page, '9-trurl');
    await page.click('#leave-plane');
    await untilPhase(page, 'cathedral');
    await expect.poll(async () => (await debug(page)).states['algebra-symmetry']).toBe('frontier');
    await expect.poll(() => worker.progress.earned).toEqual(['1arith']);
    expect(worker.unauthorized).toBe(0);
    // the secret is never in a URL or on the page
    expect(urls.filter((u) => u.includes(SECRET))).toEqual([]);
    expect(await page.content()).not.toContain(SECRET);
    // and it all survives a reload: nothing is typed again, the lit door is still lit
    await page.reload();
    await page.waitForFunction(() => !!(window as unknown as { __cathedral?: unknown }).__cathedral, null, { timeout: 60_000 });
    await expect(page.locator('#ready')).toBeVisible();
    await toCathedral(page);
    expect((await debug(page)).states['algebra-symmetry']).toBe('frontier');
    expect((await debug(page)).earned).toEqual(['1arith']);
  });

  test('without a secret Trurl sleeps with a hint and nothing is sent; the cathedral still works', async ({ page }) => {
    const worker = await mockWorker(page);
    await open(page, { seen: true });
    await page.click('#gate-nosecret');
    await toCathedral(page);
    await expect(page.locator('#captions')).toContainText('asleep');
    await page.fill('#say-input', 'hello?');
    await page.press('#say-input', 'Enter');
    await page.waitForTimeout(300);
    expect(worker.trurl).toHaveLength(0);
    expect((await debug(page)).sync).toBe('local');
  });

  test('a wrong secret turns Trurl off with a hint and does not retry in a loop', async ({ page }) => {
    const worker = await mockWorker(page);
    await open(page, { seen: true });
    await page.fill('#gate-worker', WORKER);
    await page.fill('#gate-secret', 'not-the-secret');
    await page.click('#gate-save');
    await toCathedral(page);
    await page.fill('#say-input', 'hello?');
    await page.press('#say-input', 'Enter');
    await expect(page.locator('#captions')).toContainText('does not know this secret');
    await page.fill('#say-input', 'hello again?');
    await page.press('#say-input', 'Enter');
    await page.fill('#say-input', 'and again?');
    await page.press('#say-input', 'Enter');
    await page.waitForTimeout(500);
    expect(worker.unauthorized).toBeGreaterThanOrEqual(1);
    expect(worker.trurl).toHaveLength(0); // the mock refuses before recording; the point is the app asked only once
    expect(worker.unauthorized).toBeLessThanOrEqual(3); // at most the first question and the progress sync
    expect((await debug(page)).sync).toBe('unauthorized');
    await expect(page.locator('#sync')).toContainText('secret was not accepted');
  });

  test('Trurl failing is a short in-world line, not a crash, and the visitor can ask again', async ({ page }) => {
    let n = 0;
    await mockWorker(page, { reply: () => (++n === 1 ? { text: [], status: 503 } : { text: ['Back again.'] }) });
    await open(page, { seen: true });
    await enterSecret(page);
    await toCathedral(page);
    await page.fill('#say-input', 'first');
    await page.press('#say-input', 'Enter');
    await expect(page.locator('#captions')).toContainText('lost the thread');
    await page.fill('#say-input', 'second');
    await page.press('#say-input', 'Enter');
    await expect(page.locator('#captions')).toContainText('Back again.');
  });

  test('forgetting this device clears the secret and puts Trurl back to sleep', async ({ page }) => {
    await mockWorker(page);
    await open(page, { seen: true });
    await enterSecret(page);
    await toCathedral(page);
    await page.click('#settings-btn');
    await page.click('#set-forget');
    expect(await page.evaluate(() => localStorage.getItem('truth-mines.secret'))).toBeNull();
    expect(await page.evaluate(() => localStorage.getItem('truth-mines.worker'))).toBeNull();
    await page.fill('#say-input', 'hello?');
    await page.press('#say-input', 'Enter');
    await expect(page.locator('#captions')).toContainText('asleep');
  });

  test('push-to-talk: hold V, the speech goes to the Worker and what it heard goes to Trurl', async ({ page }) => {
    const worker = await mockWorker(page, { heard: 'why did nothing fall after seven', reply: () => ({ text: ['Because ten squared is a hundred.'] }) });
    await open(page, { seen: true });
    await enterSecret(page);
    await page.click('#begin'); // asks for the microphone on this click
    await page.waitForSelector('#skip:not([hidden])');
    await page.click('#skip');
    await untilPhase(page, 'cathedral');
    await page.keyboard.down('KeyV');
    await expect(page.locator('#talk')).toHaveAttribute('data-live', 'true');
    await page.waitForTimeout(1500);
    await page.keyboard.up('KeyV');
    await expect(page.locator('#captions')).toContainText('ten squared');
    expect(worker.stt.sessions).toBe(1);
    expect(worker.stt.audioFrames).toBeGreaterThan(0);
    expect(worker.stt.ends).toBe(1);
    expect(worker.trurl).toHaveLength(1);
    expect(worker.trurl[0]!.utterance).toBe('why did nothing fall after seven');
  });

  test('a tap on talk with no speech sends nothing', async ({ page }) => {
    const worker = await mockWorker(page);
    await open(page, { seen: true });
    await enterSecret(page);
    await toCathedral(page);
    await page.dispatchEvent('#talk', 'pointerdown');
    await page.dispatchEvent('#talk', 'pointerup');
    await page.waitForTimeout(600);
    expect(worker.trurl).toHaveLength(0);
  });
});
