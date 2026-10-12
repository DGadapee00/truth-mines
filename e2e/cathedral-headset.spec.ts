/**
 * The cathedral in a headset, on the emulated Meta Quest 3 that IWSDK's dev server injects (IWER):
 * the trigger begins and skips the threshold and goes through a door, a held thumbstick never
 * slides the visitor, a snap turn is 30 degrees, B steps back, and the panel carries the words.
 * It proves the wiring on the emulator; the feel and the frame rate are for a real Quest 3.
 */
import { expect, test, type Page } from '@playwright/test';
import { app, debug, enterSecret, mockWorker, open, settled, untilPhase } from './cathedral-helpers';

type Controller = { connected: boolean; position: { set(x: number, y: number, z: number): void }; quaternion: { set(x: number, y: number, z: number, w: number): void }; updateButtonValue(id: string, v: number): void; updateAxes(id: string, x: number, y: number): void };
type IwerSource = { handedness: string; hand: object | null; profiles: string[] };
type Iwer = { controlMode: string; primaryInputMode: string; controllers: { left?: Controller; right?: Controller }; inputSources: IwerSource[] };
const ctl = (hand: 'left' | 'right') => `window.IWER_DEVICE.controllers.${hand}`;
/** The emulator's own on-page controls write the controllers' poses every frame; a test that sets a pose takes the controls over, as IWSDK's agent tooling does. */
const takeControl = (page: Page) => page.evaluate("window.IWER_DEVICE.controlMode = 'programmatic'");
const press = (page: Page, hand: 'left' | 'right', id: string, v: number) => page.evaluate(`${ctl(hand)}.updateButtonValue(${JSON.stringify(id)}, ${v})`);
const stick = (page: Page, hand: 'left' | 'right', x: number, y: number) => page.evaluate(`${ctl(hand)}.updateAxes('thumbstick', ${x}, ${y})`);

/** Hold a button until a frame has seen it (frames are slow under SwiftShader), then let go. */
async function pull(page: Page, hand: 'left' | 'right', id: string, done: () => Promise<unknown>) {
  await press(page, hand, id, 1);
  await done();
  await press(page, hand, id, 0);
}

/** Point the right controller from the rig's origin at a place in the cathedral's frame. The rig faces +Z (yaw pi), so its local axes are the world's turned a half turn. */
async function aimAt(page: Page, world: [number, number, number]) {
  await page.evaluate(
    ([w]) => {
      const c = (window as unknown as { IWER_DEVICE: { controllers: { right: Controller } } }).IWER_DEVICE.controllers.right;
      const from: [number, number, number] = [0, 1.2, 0];
      const d: [number, number, number] = [w[0] - from[0], w[1] - from[1], w[2] - from[2]];
      const n = Math.hypot(...d);
      const u: [number, number, number] = [-d[0] / n, d[1] / n, -d[2] / n]; // into the rig's frame: a half turn about Y
      const ax = u[1];
      const ay = -u[0];
      const sin = Math.hypot(ax, ay);
      const ang = Math.atan2(sin, -u[2]);
      const [kx, ky] = sin > 1e-9 ? [ax / sin, ay / sin] : [1, 0];
      const h = Math.sin(ang / 2);
      c.position.set(from[0], from[1], from[2]);
      c.quaternion.set(kx * h, ky * h, 0, Math.cos(ang / 2));
    },
    [world] as [[number, number, number]],
  );
}

async function inHeadset(page: Page, opts: { seen: boolean }) {
  await open(page, { seen: opts.seen });
  await page.click('#gate-nosecret');
  await expect(page.locator('#enter-vr')).toBeVisible();
  await page.click('#enter-vr');
  await expect.poll(async () => (await debug(page)).xr, { timeout: 30_000 }).toBe(true);
  await takeControl(page);
}

test.describe('headset', () => {
  test('the panel tells you to pull the trigger; the trigger begins; on a return visit it skips to the dais', async ({ page }) => {
    await inHeadset(page, { seen: true });
    await expect.poll(async () => (await debug(page)).xrPanel?.hint, { timeout: 20_000 }).toContain('trigger');
    // The ready hint is approved. The caption is Trurl's sleeping hint, which is still a draft, so the panel says so apart from the words.
    expect((await debug(page)).xrPanel?.draft, 'the sleeping hint is still a draft, so the panel says so apart from its words').toBe(true);
    expect((await debug(page)).xrPanel?.hint).not.toMatch(/draft/i);
    expect((await debug(page)).xrPanel?.visible).toBe(true);
    await page.screenshot({ path: 'e2e/output/cathedral-headset-1-ready.png' });
    await pull(page, 'right', 'trigger', () => untilPhase(page, 'threshold', 30_000));
    await expect.poll(async () => (await debug(page)).xrPanel?.hint).toContain('skip');
    await pull(page, 'right', 'trigger', () => untilPhase(page, 'cathedral', 60_000));
    await settled(page);
    const d = await debug(page);
    expect(Math.hypot(d.pos[0], d.pos[2])).toBeLessThan(0.1);
    expect(d.slideRegistered).toBe(false);
    await page.screenshot({ path: 'e2e/output/cathedral-headset-2-cathedral.png' });
  });

  test('a first visit cannot be skipped from the controller either', async ({ page }) => {
    await inHeadset(page, { seen: false });
    await pull(page, 'right', 'trigger', () => untilPhase(page, 'threshold', 30_000));
    await page.waitForTimeout(500);
    await pull(page, 'right', 'trigger', () => page.waitForTimeout(2500));
    expect((await debug(page)).phase).toBe('threshold');
    await expect.poll(async () => (await debug(page)).xrPanel?.hint).toContain('Nothing will turn you');
  });

  test('no smooth locomotion: a held thumbstick never moves the visitor, and a snap turn is exactly 30 degrees', async ({ page }) => {
    await inHeadset(page, { seen: true });
    await pull(page, 'right', 'trigger', () => untilPhase(page, 'threshold', 30_000));
    await pull(page, 'right', 'trigger', () => untilPhase(page, 'cathedral', 60_000));
    await settled(page);
    const before = await debug(page);
    // the left thumbstick held forward for a while: the slide that IWSDK normally gives it is gone
    await stick(page, 'left', 0, -1);
    await page.waitForTimeout(2500);
    await stick(page, 'left', 0, 0);
    const after = await debug(page);
    expect([after.pos[0], after.pos[2]]).toEqual([before.pos[0], before.pos[2]]); // not a millimetre sideways
    expect(Math.abs(after.pos[1] - before.pos[1])).toBeLessThan(0.02); // the floor's own few millimetres of settling
    // the right thumbstick: one 30 degree snap per push, however long it is held
    await stick(page, 'right', 0.95, 0);
    const turned = async () => {
      const d = (await debug(page)).rigYaw - before.rigYaw;
      return Math.abs(Math.atan2(Math.sin(d), Math.cos(d)));
    };
    await expect.poll(turned, { timeout: 20_000 }).toBeCloseTo(Math.PI / 6, 4);
    await page.waitForTimeout(1500);
    expect(await turned()).toBeCloseTo(Math.PI / 6, 4);
    await stick(page, 'right', 0, 0);
  });

  test('point at the glowing door and pull the trigger to go through; B comes back; a dim door stays shut', async ({ page }) => {
    await inHeadset(page, { seen: true });
    await pull(page, 'right', 'trigger', () => untilPhase(page, 'threshold', 30_000));
    await pull(page, 'right', 'trigger', () => untilPhase(page, 'cathedral', 60_000));
    await settled(page);
    const door = (await page.evaluate("window.__cathedral.cathedral.doors.map((d) => ({ plane: d.plane, pos: d.pos }))")) as { plane: string; pos: [number, number, number] }[];
    const nt = door.find((d) => d.plane === 'number-theory')!;
    const dim = door.find((d) => d.plane === 'algebra-symmetry')!; // dim: it rests on the definition of a prime
    await aimAt(page, [dim.pos[0], 2, dim.pos[2]]);
    await expect.poll(async () => (await debug(page)).xrPanel?.hint, { timeout: 20_000 }).toContain('dim');
    await pull(page, 'right', 'trigger', async () => {
      await page.waitForTimeout(1500);
    });
    expect((await debug(page)).phase).toBe('cathedral');
    await aimAt(page, [nt.pos[0], 2, nt.pos[2]]);
    await expect.poll(async () => (await debug(page)).xrPanel?.hint, { timeout: 20_000 }).toContain('open');
    await pull(page, 'right', 'trigger', () => untilPhase(page, 'plane', 60_000));
    await settled(page);
    expect((await app<{ standing: number }>(page, 'debug()')).standing).toBe(99);
    await page.screenshot({ path: 'e2e/output/cathedral-headset-3-plane.png' });
    await pull(page, 'right', 'b-button', () => untilPhase(page, 'cathedral', 60_000));
  });

  test('leaving VR from inside the plane brings back the cathedral, and the place in the plane is kept', async ({ page }) => {
    await inHeadset(page, { seen: true });
    await pull(page, 'right', 'trigger', () => untilPhase(page, 'threshold', 30_000));
    await pull(page, 'right', 'trigger', () => untilPhase(page, 'cathedral', 60_000));
    await settled(page);
    const nt = ((await page.evaluate("window.__cathedral.cathedral.doors.map((d) => ({ plane: d.plane, pos: d.pos }))")) as { plane: string; pos: [number, number, number] }[]).find((d) => d.plane === 'number-theory')!;
    await aimAt(page, [nt.pos[0], 2, nt.pos[2]]);
    await expect.poll(async () => (await debug(page)).xrPanel?.hint, { timeout: 20_000 }).toContain('open');
    await pull(page, 'right', 'trigger', () => untilPhase(page, 'plane', 60_000));
    await settled(page);
    // the Quest's own menu ends the session while the visitor is on the road
    await page.evaluate('window.__cathedral.world.renderer.xr.getSession()?.end()');
    await expect.poll(async () => (await debug(page)).xr, { timeout: 30_000 }).toBe(false);
    await untilPhase(page, 'ready');
    expect((await debug(page)).shown).toEqual({ hall: true, vault: true, plane: false });
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('truth-mines.progress') ?? '{}').pathways?.['number-theory']?.stretch)).toBe('nt-1');
    // and on the screen the visitor crosses again into a whole cathedral
    await page.click('#begin');
    await page.waitForSelector('#skip:not([hidden])', { timeout: 20_000 });
    await page.click('#skip');
    await untilPhase(page, 'cathedral');
    await settled(page);
    expect((await debug(page)).shown).toEqual({ hall: true, vault: true, plane: false });
  });

  test('hold A to talk: the speech goes to the Worker and Trurl’s words reach the panel', async ({ page }) => {
    const worker = await mockWorker(page, { heard: 'why did nothing fall after seven', reply: () => ({ text: ['Because ten squared is a hundred.'] }) });
    await open(page, { seen: true });
    await enterSecret(page);
    await expect(page.locator('#enter-vr')).toBeVisible();
    await page.click('#enter-vr'); // asks for the microphone on this click
    await expect.poll(async () => (await debug(page)).xr, { timeout: 30_000 }).toBe(true);
    await takeControl(page);
    await pull(page, 'right', 'trigger', () => untilPhase(page, 'threshold', 30_000));
    await pull(page, 'right', 'trigger', () => untilPhase(page, 'cathedral', 60_000));
    await settled(page);
    await press(page, 'right', 'a-button', 1);
    await expect.poll(() => worker.stt.sessions, { timeout: 20_000 }).toBe(1);
    await page.waitForTimeout(1500);
    await press(page, 'right', 'a-button', 0);
    await expect.poll(async () => (await debug(page)).xrPanel?.caption, { timeout: 30_000 }).toContain('ten squared');
    expect(worker.trurl).toHaveLength(1);
    expect(worker.stt.audioFrames).toBeGreaterThan(0);
  });

  test('putting the controllers down switches to hands and the session keeps going', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await inHeadset(page, { seen: true });
    await pull(page, 'right', 'trigger', () => untilPhase(page, 'threshold', 30_000));
    await pull(page, 'right', 'trigger', () => untilPhase(page, 'cathedral', 60_000));
    await settled(page);
    const before = await page.evaluate(() => {
      const d = (window as unknown as { IWER_DEVICE: Iwer }).IWER_DEVICE;
      return d.inputSources.map((s) => s.handedness);
    });
    expect(before.sort()).toEqual(['left', 'right']);

    // Quest puts the controllers down and hand tracking takes over. Gameplay stays on the controllers; this only checks the switch does not throw.
    const after = await page.evaluate(() => {
      const d = (window as unknown as { IWER_DEVICE: Iwer }).IWER_DEVICE;
      d.controlMode = 'programmatic';
      d.controllers.left?.position.set(-0.25, 0.08, 0.15);
      d.controllers.right?.position.set(0.25, 0.08, 0.15);
      d.controllers.left!.connected = false;
      d.controllers.right!.connected = false;
      d.primaryInputMode = 'hand';
      return {
        mode: d.primaryInputMode,
        sources: d.inputSources.map((s) => ({ handedness: s.handedness, hand: s.hand != null, profiles: [...s.profiles] })),
      };
    });
    expect(after.mode).toBe('hand');
    expect(after.sources.map((s) => s.handedness).sort()).toEqual(['left', 'right']);
    expect(after.sources.every((s) => s.hand)).toBe(true);
    expect(after.sources.every((s) => s.profiles.includes('oculus-hand'))).toBe(true);

    await page.waitForTimeout(2000);
    const d = await debug(page);
    expect(d.xr).toBe(true);
    expect(d.phase).toBe('cathedral');
    expect(d.pos.every((n) => Number.isFinite(n))).toBe(true);
    expect(errors).toEqual([]);
  });
});
