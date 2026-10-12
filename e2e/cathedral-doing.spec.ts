/**
 * Earning by doing, end to end on the desktop: a stack stays veiled until the visitor takes it apart,
 * the sieve is predicted, Trurl asks his question only after the doing, no text on screen says the
 * answer while a moment is open, and a verdict counts only if the doing happened in this session.
 * The Worker is mocked, and made as persuadable as possible (it always says the visitor has earned
 * everything), so what is tested is the app's own rules.
 */
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { parsePathways, parsePlane } from '../core/schema';
import { SECRET, app, debug, enterSecret, intoNumberTheory, lookAt, mockWorker, open, toCathedral, typeLine } from './cathedral-helpers';

const data = (name: string): unknown => JSON.parse(readFileSync(new URL(`../data/${name}`, import.meta.url), 'utf8'));
const plane = parsePlane(data('plane-number-theory.json'));
const pathways = parsePathways(data('pathways.json'));
const neverShow = data('never-show.json') as Record<string, string[]>;
const moments = Object.fromEntries(pathways.pathways.flatMap((p) => p.stretches.flatMap((s) => s.moments)).map((m) => [m.id, m]));
const prime = (p: number) => plane.primes.find((x) => x.p === p)!.color.toLowerCase();
const VEIL = plane.road.veil.colour.toLowerCase();

/** A Worker that always declares the visitor has earned everything the moment could grant */
const persuadable = (body: Record<string, unknown>) => ({ text: ['Brilliant. You have it.'], earned: body.moment === 'nt-1-road' ? ['1arith', 'df-prm'] : ['df-prm', '1arith'] });

async function inThePlane(page: Page, opts: { heard?: string } = {}) {
  const worker = await mockWorker(page, { reply: (_u, body) => persuadable(body), heard: opts.heard });
  await open(page, { seen: true });
  await enterSecret(page);
  await toCathedral(page);
  await intoNumberTheory(page);
  return worker;
}

const roadColours = (page: Page, n: number, blocks: number) => Promise.all(Array.from({ length: blocks }, (_, k) => app<string>(page, `roadBlock(${n}, ${k})`)));
const toast = (page: Page) => page.locator('#toast');

/** Take three stacks apart, as a visitor would: look, then type the primes */
async function doTheRoad(page: Page) {
  for (const [n, said] of [[12, '2, 2, 3'], [18, '2 3 3'], [8, '2 times 2 times 2']] as const) {
    await lookAt(page, 'road', n);
    await typeLine(page, said);
    await expect(toast(page)).toContainText('Yes.');
    await page.waitForFunction((m) => (window as unknown as { __cathedral: { roadRevealed(n: number): boolean } }).__cathedral.roadRevealed(m), n);
  }
}

test.describe('earning by doing', () => {
  test('the road: a stack stays veiled until the visitor takes it apart, and a right answer assembles it', async ({ page }) => {
    const worker = await inThePlane(page);
    await lookAt(page, 'road', 12);
    // veiled: the sign is only the number, every block is the one plain colour, and the stack's threads are not drawn
    await expect(page.locator('#pl-focus')).toHaveText('12');
    expect(await roadColours(page, 12, 3)).toEqual([VEIL, VEIL, VEIL]);
    expect(await app<boolean>(page, 'roadRevealed(12)')).toBe(false);

    await typeLine(page, '2, 3');
    await expect(toast(page)).toContainText('Those multiply to 6, not 12');
    await typeLine(page, '4, 3');
    await expect(toast(page)).toContainText('4 is not a prime');
    expect(await roadColours(page, 12, 3)).toEqual([VEIL, VEIL, VEIL]);
    expect((await debug(page)).doing.predicted).toEqual([]);

    await typeLine(page, '2, 2, 3');
    await expect(toast(page)).toContainText('Yes. 12 = 2² · 3.');
    await expect.poll(() => roadColours(page, 12, 3)).toEqual([prime(2), prime(2), prime(3)]); // assembled bottom to top
    await expect(page.locator('#pl-focus')).toHaveText('12 = 2² · 3');
    expect((await debug(page)).doing.predicted).toEqual([12]);
    expect(await roadColours(page, 18, 3)).toEqual([VEIL, VEIL, VEIL]); // no other stack changed
    expect(worker.trurl, 'an answer to the activity is judged in the app and never goes to Trurl').toEqual([]);
    await page.screenshot({ path: 'e2e/output/cathedral-doing-1-road.png' });
  });

  test('a prime is taken apart too: it is only itself', async ({ page }) => {
    await inThePlane(page);
    await lookAt(page, 'road', 11);
    await expect(page.locator('#pl-focus')).toHaveText('11');
    await typeLine(page, 'eleven');
    await expect(toast(page)).toContainText('Yes. 11 is prime.');
    await expect(page.locator('#pl-focus')).toHaveText('11 is prime');
  });

  test('by voice: hold V and say the primes, and the stack assembles', async ({ page }) => {
    const worker = await inThePlane(page, { heard: 'two, two and three' });
    await lookAt(page, 'road', 12);
    await page.keyboard.down('KeyV');
    await expect(page.locator('#talk')).toHaveAttribute('data-live', 'true');
    await page.waitForTimeout(1500);
    await page.keyboard.up('KeyV');
    await expect(toast(page)).toContainText('Yes. 12 = 2² · 3.');
    expect(worker.stt.sessions).toBe(1);
    expect(worker.trurl).toEqual([]);
    await expect.poll(() => roadColours(page, 12, 3)).toEqual([prime(2), prime(2), prime(3)]);
  });

  test('the sieve: name the next prime each time, and say when it is safe to stop', async ({ page }) => {
    const worker = await inThePlane(page);
    await page.keyboard.press('Digit2');
    await page.waitForFunction(() => (window as unknown as { __cathedral: { debug(): { zone: string } } }).__cathedral.debug().zone === 'plaza', null, { timeout: 30_000 });
    await typeLine(page, '4');
    await expect(toast(page)).toContainText('Not that one');
    await typeLine(page, '9');
    expect((await debug(page)).standing).toBe(99);
    await typeLine(page, 'done');
    await expect(toast(page)).toContainText('Strike something first');

    await typeLine(page, '2');
    await expect.poll(async () => (await debug(page)).standing).toBe(50);
    await typeLine(page, '4');
    await expect(toast(page)).toContainText('already crumbled');
    await typeLine(page, 'done');
    await expect(toast(page)).toContainText('Not yet');
    await typeLine(page, '5');
    await expect(toast(page)).toContainText('Not that one'); // 3 comes first
    for (const n of [3, 5]) await typeLine(page, String(n));
    await typeLine(page, 'nothing more would fall');
    await expect(toast(page)).toContainText('Not yet'); // 7 x 7 is still standing
    expect((await debug(page)).doingDone.sieve).toBe(false);
    await typeLine(page, '7');
    await expect.poll(async () => (await debug(page)).standing).toBe(25);
    await typeLine(page, "that's all");
    await expect(toast(page)).toContainText('Nothing more would fall');
    const d = await debug(page);
    expect(d.doing).toEqual({ predicted: [], struck: [2, 3, 5, 7], stopped: true });
    expect(d.doingDone.sieve).toBe(true);
    expect(worker.trurl).toEqual([]);
    await page.screenshot({ path: 'e2e/output/cathedral-doing-2-sieve.png' });
  });

  test('pointing at the next prime names it too', async ({ page }) => {
    await inThePlane(page);
    await page.keyboard.press('Digit2');
    await page.waitForFunction(() => (window as unknown as { __cathedral: { debug(): { zone: string } } }).__cathedral.debug().zone === 'plaza', null, { timeout: 30_000 });
    await lookAt(page, 'plaza', 9);
    await app(page, 'activateFocus()');
    await expect(toast(page)).toContainText('Not that one');
    await lookAt(page, 'plaza', 2);
    await app(page, 'activateFocus()');
    await expect.poll(async () => (await debug(page)).doing.struck).toEqual([2]);
  });

  test('Trurl asks his question only after the doing, and nothing on screen says the answer while a moment is open', async ({ page }) => {
    const worker = await inThePlane(page);
    const scan = async (where: string) => {
      const seen = [...(await app<string[]>(page, 'visibleText()')), (await debug(page)).captions.caption];
      for (const [id, patterns] of Object.entries(neverShow)) {
        for (const p of patterns) for (const text of seen) expect(text, `${where}: "${text}" says the answer to ${id}`).not.toMatch(new RegExp(p, 'i'));
      }
      return seen;
    };

    // arriving on the road: what to do, not what is true
    const arrival = await scan('arrival');
    expect(arrival.join(' ')).toContain('A prime stands alone as a tall monolith');
    expect(arrival.join(' ')).not.toContain('Trurl'); // no question yet
    expect((await debug(page)).captions.caption).toBe('');

    await lookAt(page, 'road', 12);
    await scan('a veiled stack in view');
    await typeLine(page, '2, 3');
    await scan('after a wrong answer');
    await lookAt(page, 'road', 64);
    await scan('another stack');

    // two stacks taken apart: still no question
    for (const [n, said] of [[12, '2 2 3'], [18, '2 3 3']] as const) {
      await lookAt(page, 'road', n);
      await typeLine(page, said);
      await expect(toast(page)).toContainText('Yes.');
    }
    await scan('two stacks apart');
    expect((await debug(page)).captions.caption).toBe('');

    // the third: now, and only now, Trurl asks, in a caption, from the data; nothing was sent
    await lookAt(page, 'road', 8);
    await typeLine(page, '2 2 2');
    await expect(page.locator('#captions')).toContainText(moments['nt-1-road']!.question);
    await expect(page.locator('#captions')).toHaveAttribute('data-draft', 'true'); // an unreviewed line is marked as a draft
    expect(await page.locator('#captions').textContent()).not.toMatch(/draft/i); // by the style, never in the words
    await scan('the road question');
    expect(worker.trurl).toEqual([]);
    await page.screenshot({ path: 'e2e/output/cathedral-doing-3-question.png' });

    // the plaza: the same
    await page.keyboard.press('Digit2');
    await page.waitForFunction(() => (window as unknown as { __cathedral: { debug(): { zone: string } } }).__cathedral.debug().zone === 'plaza', null, { timeout: 30_000 });
    await expect(page.locator('#pl-text')).toContainText('Name the next prime to strike'); // the HUD follows the visitor a moment later
    const plaza = await scan('the plaza');
    expect(plaza.join(' ')).toContain('Name the next prime to strike');
    await typeLine(page, '2');
    await typeLine(page, '3');
    await scan('mid sieve');
    for (const n of [5, 7]) await typeLine(page, String(n));
    await typeLine(page, 'done');
    await expect(page.locator('#captions')).toContainText(moments['nt-1-sieve']!.question);
    const finished = await scan('the sieve question');
    expect(finished.join(' ')).not.toMatch(/survive|square root/);
    await expect(page.locator('#pl-note')).toBeHidden(); // the note that explains it waits until the idea is earned
    expect(worker.trurl).toEqual([]);
  });

  test('the answer shows once the idea is earned: the plane’s fuller lines return', async ({ page }) => {
    const worker = await inThePlane(page);
    await doTheRoad(page);
    await page.keyboard.press('Digit2');
    await page.waitForFunction(() => (window as unknown as { __cathedral: { debug(): { zone: string } } }).__cathedral.debug().zone === 'plaza', null, { timeout: 30_000 });
    for (const n of [2, 3, 5, 7]) await typeLine(page, String(n));
    await typeLine(page, 'done');
    await typeLine(page, 'a prime has only one and itself as divisors, and those are what is left');
    await expect.poll(async () => (await debug(page)).earned).toContain('df-prm');
    expect(worker.trurl.length).toBe(1);
    await expect(page.locator('#pl-note')).toContainText('square root');
    await expect(page.locator('#pl-text')).toContainText('What is left standing is the primes');
  });

  test('the verdict counts only if the doing happened in this session', async ({ page }) => {
    const worker = await inThePlane(page);
    // 1. the Worker declares victory to someone who has done nothing: nothing is earned
    await typeLine(page, 'every number is built from primes in one way, obviously');
    await expect(page.locator('#captions')).toContainText('Brilliant');
    expect(worker.trurl).toHaveLength(1);
    expect(worker.trurl[0]).toMatchObject({ schema_version: 2, moment: 'nt-1-road', doing: { predicted: [], struck: [], stopped: false } });
    expect((await debug(page)).earned).toEqual([]);

    // 2. after the road, the Worker's verdict earns the road's idea and nothing else
    await doTheRoad(page);
    await expect(page.locator('#captions')).toContainText(moments['nt-1-road']!.question);
    await typeLine(page, 'there is only one way to split a number into primes, whatever the order');
    await expect.poll(async () => (await debug(page)).earned).toEqual(['1arith']);
    expect(worker.trurl.at(-1)).toMatchObject({ moment: 'nt-1-road', doing: { predicted: [12, 18, 8] } });
    expect((await debug(page)).states['complex-numbers']).toBe('dim'); // the map moved

    // 3. the sieve was not done: its verdict, in the Worker's persuadable mouth, earns nothing
    await page.keyboard.press('Digit2');
    await page.waitForFunction(() => (window as unknown as { __cathedral: { debug(): { zone: string } } }).__cathedral.debug().zone === 'plaza', null, { timeout: 30_000 });
    await typeLine(page, 'a prime has only one and itself as divisors');
    await expect(page.locator('#captions')).toContainText('Brilliant');
    expect((await debug(page)).earned).toEqual(['1arith']);
    expect((await debug(page)).states['algebra-symmetry']).toBe('dim');

    // 4. a new session knows nothing of the old one's doing, even though the idea earned stays earned
    await page.reload();
    await page.waitForFunction(() => !!(window as unknown as { __cathedral?: unknown }).__cathedral, null, { timeout: 60_000 });
    await expect(page.locator('#ready')).toBeVisible();
    await toCathedral(page);
    expect((await debug(page)).earned).toEqual(['1arith']);
    expect((await debug(page)).doing).toEqual({ predicted: [], struck: [], stopped: false });
    await intoNumberTheory(page);
    await page.keyboard.press('Digit2');
    await page.waitForFunction(() => (window as unknown as { __cathedral: { debug(): { zone: string } } }).__cathedral.debug().zone === 'plaza', null, { timeout: 30_000 });
    await typeLine(page, 'a prime has only one and itself as divisors');
    await expect(page.locator('#captions')).toContainText('Brilliant');
    expect((await debug(page)).earned, 'the sieve was never done in this session').toEqual(['1arith']);
    expect(worker.unauthorized).toBe(0);
    expect(SECRET).toBeTruthy();
  });

  test('without Trurl, the doing alone earns: the question still shows and the map moves', async ({ page }) => {
    await open(page, { seen: true });
    await page.click('#gate-nosecret');
    await toCathedral(page);
    await intoNumberTheory(page);
    expect((await debug(page)).captions.disabled).toBe('no-secret');
    // Before anything is earned, complex numbers rests on both ideas, so that door is sealed.
    expect((await debug(page)).states['complex-numbers']).toBe('sealed');

    await typeLine(page, 'every number is built from primes in one way, obviously');
    expect((await debug(page)).earned).toEqual([]);

    await doTheRoad(page);
    await expect(page.locator('#captions')).toContainText(moments['nt-1-road']!.question);
    await expect.poll(async () => (await debug(page)).earned).toEqual(['1arith']);
    expect((await debug(page)).states['complex-numbers']).toBe('dim');
    expect((await debug(page)).sync).toBe('local');

    await page.keyboard.press('Digit2');
    await page.waitForFunction(() => (window as unknown as { __cathedral: { debug(): { zone: string } } }).__cathedral.debug().zone === 'plaza', null, { timeout: 30_000 });
    for (const n of [2, 3, 5, 7]) await typeLine(page, String(n));
    await typeLine(page, 'done');
    await expect(page.locator('#captions')).toContainText(moments['nt-1-sieve']!.question);
    await expect.poll(async () => [...(await debug(page)).earned].sort()).toEqual(['1arith', 'df-prm']);
    await expect(page.locator('#pl-note')).toContainText('square root');
    await page.screenshot({ path: 'e2e/output/cathedral-doing-4-without-trurl.png' });

    await page.reload();
    await page.waitForFunction(() => !!(window as unknown as { __cathedral?: unknown }).__cathedral, null, { timeout: 60_000 });
    expect([...(await debug(page)).earned].sort()).toEqual(['1arith', 'df-prm']);
  });
});
