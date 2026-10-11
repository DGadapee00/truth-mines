/**
 * Unreviewed wording is never shown as if it were finished content. Every line of prose the app
 * writes ahead of time is a draft until a person approves it; on screen a draft carries a small tag
 * drawn by the style (data-draft), never in its words. Interface text (buttons, status, plain errors)
 * is not content and carries no tag.
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import { app, enterSecret, intoNumberTheory, mockWorker, open, toCathedral, typeLine } from './cathedral-helpers';

/** What the style draws before the element's text */
const tag = (l: Locator) => l.evaluate((e) => getComputedStyle(e, '::before').content);
const isDraft = async (l: Locator) => {
  expect(await l.getAttribute('data-draft')).toBe('true');
  expect(await tag(l)).toBe('"draft"');
  expect(await l.textContent()).not.toMatch(/draft/i); // the tag is the style's, not the sentence's
};
const notDraft = async (l: Locator) => {
  expect(await l.getAttribute('data-draft')).not.toBe('true');
  expect(await tag(l)).toMatch(/^(none|normal)$/);
};
const noDraftInWords = async (page: Page) => {
  for (const text of await app<string[]>(page, 'visibleText()')) expect(text).not.toMatch(/\(draft\)|draft/i);
};

test.describe('drafts are marked apart from the words', () => {
  test('the first screens, the cathedral, a door and the plane', async ({ page }) => {
    await mockWorker(page);
    await open(page, { seen: true });
    await isDraft(page.locator('#gate-intro'));
    await expect(page.locator('#gate-save')).toBeVisible();
    await notDraft(page.locator('#gate-save')); // interface is not content
    await enterSecret(page);
    await isDraft(page.locator('#ready-text'));
    await toCathedral(page);
    await isDraft(page.locator('#place-text'));
    await app(page, 'stand(0, -3)');
    await app(page, "lookAtDoor('algebra-symmetry')");
    await expect(page.locator('#door-label')).toContainText('dim');
    await isDraft(page.locator('#door-label'));
    await page.keyboard.press('Enter');
    await expect(page.locator('#toast')).toContainText('not open to you yet');
    await isDraft(page.locator('#toast'));
    await noDraftInWords(page);

    await intoNumberTheory(page);
    await expect(page.locator('#pl-text')).toContainText('A prime stands alone');
    await isDraft(page.locator('#pl-text')); // the plane's own lines are unreviewed in the data
    await expect(page.locator('#pl-text')).not.toContainText('(draft)');
    await noDraftInWords(page);
  });

  test('an interface notice is not a draft', async ({ page }) => {
    await open(page, { seen: true });
    await page.click('#gate-nosecret');
    await app(page, "showNotice('No microphone here: type to Trurl instead.')");
    await expect(page.locator('#toast')).toContainText('No microphone');
    await notDraft(page.locator('#toast'));
  });

  test('Trurl’s sleeping hint and lost-thread line are drafts; his live reply is not', async ({ page }) => {
    await open(page, { seen: true });
    await page.click('#gate-nosecret');
    await toCathedral(page);
    await typeLine(page, 'hello');
    await expect(page.locator('#captions')).toContainText('asleep');
    await isDraft(page.locator('#captions'));
  });

  test('a live reply carries no tag, a failure line does', async ({ page }) => {
    let fail = true;
    const worker = await mockWorker(page, { reply: () => (fail ? { text: [], status: 500 } : { text: ['Hm, a visitor.'] }) });
    await open(page, { seen: true });
    await enterSecret(page);
    await toCathedral(page);
    await typeLine(page, 'hello');
    await expect(page.locator('#captions')).toContainText('lost the thread');
    await isDraft(page.locator('#captions'));
    fail = false;
    await typeLine(page, 'hello again');
    await expect(page.locator('#captions')).toContainText('a visitor');
    await notDraft(page.locator('#captions'));
    expect(worker.trurl).toHaveLength(2);
  });

  test('once a person approves a line its tag goes, and no other line’s does', async ({ page }) => {
    await open(page, { seen: true });
    await page.click('#gate-nosecret');
    await toCathedral(page);
    await app(page, "approveLines('door-dim')");
    await app(page, 'stand(0, -3)');
    await app(page, "lookAtDoor('algebra-symmetry')");
    await expect(page.locator('#door-label')).toContainText('dim');
    await notDraft(page.locator('#door-label'));
    await app(page, "lookAtDoor('topology')");
    await expect(page.locator('#door-label')).toContainText('sealed');
    await isDraft(page.locator('#door-label'));
  });
});
