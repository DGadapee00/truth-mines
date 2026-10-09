/**
 * Screenshots of the mine for checking by eye, into scripts/output/shots/.
 * Needs the dev server: npx vite --port 5175 --strictPort
 *   node scripts/shots.mjs        laptop (1400×860) and phone (390×844)
 */
import fs from 'node:fs';
import { chromium } from './playwright.mjs';

const out = new URL('./output/shots/', import.meta.url).pathname;
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [];

for (const [name, viewport] of [
  ['laptop', { width: 1400, height: 860 }],
  ['phone', { width: 390, height: 844 }],
]) {
  const page = await browser.newPage({ viewport, isMobile: name === 'phone', hasTouch: name === 'phone' });
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`${name}: ${m.text()}`));
  await page.goto('http://localhost:5175/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}${name}-1-mine.png` });
  await page.evaluate(() => window.__mines.app.select('biot-wire'));
  await page.waitForTimeout(1300);
  await page.screenshot({ path: `${out}${name}-2-card.png` });
  await page.evaluate(() => window.__mines.app.startRun());
  await page.waitForTimeout(300);
  // Pick a wrong option, then the right one.
  await page.evaluate(() => {
    const run = window.__mines.app.run;
    const wrong = run.step.options.findIndex((o) => !o.ok);
    window.__mines.app.pick(wrong);
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}${name}-3-wrong.png` });
  await page.evaluate(() => {
    const app = window.__mines.app;
    while (app.run) {
      app.pick(app.run.step.options.findIndex((o) => o.ok));
      if (app.run.k === app.run.steps.length - 2) break;
      app.next();
    }
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}${name}-4-working.png` });
  await page.evaluate(() => {
    const app = window.__mines.app;
    app.next();
    app.pick(app.run.step.options.findIndex((o) => o.ok));
    app.next();
  });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}${name}-5-mined.png` });
  await page.evaluate(() => window.__mines.app.select(null));
  await page.waitForTimeout(1300);
  await page.screenshot({ path: `${out}${name}-6-after.png` });
  await page.close();
}
await browser.close();
console.log(errors.length ? errors.join('\n') : 'no page errors');
