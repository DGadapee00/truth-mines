import type { Page, Route } from '@playwright/test';

/** The mocked Worker lives on the page's own origin, so no CORS and no real network. */
export const WORKER = 'https://localhost:5177/mock';
export const SECRET = 'e2e-secret-0123456789';

export interface Reply {
  text: string[];
  earned?: string[];
  /** Answer with this HTTP status instead of a stream */
  status?: number;
}

interface Progress {
  schema_version: 1;
  earned: string[];
  pathways: Record<string, { stretch: string; resume: { pos: number[]; yaw: number }; updated_at: string }>;
  updated_at: string;
}

const sse = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

/**
 * A stand-in for the Worker: /api/trurl streams what `reply` says, /api/progress keeps a merged
 * copy in memory, /api/stt answers a push-to-talk with `heard`. Every route checks the bearer
 * secret, as the real one does. Records what it was sent.
 */
export async function mockWorker(
  page: Page,
  opts: { reply?: (utterance: string, body: Record<string, unknown>) => Reply; heard?: string; progress?: Progress } = {},
) {
  const rec = {
    trurl: [] as Record<string, unknown>[],
    progressPuts: 0,
    stt: { sessions: 0, audioFrames: 0, ends: 0, subprotocols: [] as string[] },
    unauthorized: 0,
    progress: opts.progress ?? ({ schema_version: 1, earned: [], pathways: {}, updated_at: '1970-01-01T00:00:00Z' } as Progress),
  };
  const authed = (route: Route) => {
    const ok = route.request().headers().authorization === `Bearer ${SECRET}`;
    if (!ok) rec.unauthorized++;
    return ok;
  };

  await page.route('**/mock/api/trurl', async (route) => {
    if (!authed(route)) return route.fulfill({ status: 401, body: '{"error":"unauthorized"}' });
    const body = route.request().postDataJSON() as Record<string, unknown>;
    rec.trurl.push(body);
    const r: Reply = (opts.reply ?? ((): Reply => ({ text: ['Hm.'] })))(String(body.utterance), body);
    if (r.status) return route.fulfill({ status: r.status, body: '{"error":"x"}' });
    const text = r.text.map((t) => sse('text', { delta: t })).join('');
    await route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: text + sse('verdict', { earned: r.earned ?? [] }) + sse('done', {}) });
  });

  await page.route('**/mock/api/progress', async (route) => {
    if (!authed(route)) return route.fulfill({ status: 401, body: '{"error":"unauthorized"}' });
    if (route.request().method() === 'PUT') {
      rec.progressPuts++;
      const p = route.request().postDataJSON() as Progress;
      const merged: Progress = { ...rec.progress, earned: [...new Set([...rec.progress.earned, ...p.earned])].sort(), pathways: { ...rec.progress.pathways }, updated_at: p.updated_at > rec.progress.updated_at ? p.updated_at : rec.progress.updated_at };
      for (const [plane, w] of Object.entries(p.pathways)) if (!merged.pathways[plane] || w.updated_at >= merged.pathways[plane]!.updated_at) merged.pathways[plane] = w;
      rec.progress = merged;
    }
    await route.fulfill({ status: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(rec.progress) });
  });

  await page.routeWebSocket('**/mock/api/stt', (ws) => {
    rec.stt.sessions++;
    ws.onMessage((m) => {
      if (typeof m === 'string') {
        if (JSON.parse(m).type === 'end') {
          rec.stt.ends++;
          ws.send(JSON.stringify({ type: 'final', text: opts.heard ?? 'why did nothing fall after seven' }));
          ws.close({ code: 1000 });
        }
      } else rec.stt.audioFrames++;
    });
  });
  return rec;
}

/** Type the Worker address and secret into the gate and continue, as a first-time visitor would. */
export async function enterSecret(page: Page): Promise<void> {
  await page.fill('#gate-worker', WORKER);
  await page.fill('#gate-secret', SECRET);
  await page.click('#gate-save');
}

export async function open(page: Page, opts: { seen?: boolean } = {}): Promise<void> {
  if (opts.seen) await page.addInitScript(() => localStorage.setItem('truth-mines.threshold-seen', '1'));
  await page.goto('/');
  await page.waitForFunction(() => !!(window as unknown as { __cathedral?: unknown }).__cathedral, null, { timeout: 60_000 });
}

/** What the app's debug() reports (cathedral/src/app.ts). Written out here so this suite does not compile the app against the root's older three typings. */
export interface Debug {
  phase: 'gate' | 'ready' | 'threshold' | 'cathedral' | 'plane';
  xr: boolean;
  rigYaw: number;
  xrPanel: { visible: boolean; place: string; caption: string; hint: string } | null;
  states: Record<string, 'frontier' | 'dim' | 'sealed'>;
  earned: string[];
  sync: 'local' | 'synced' | 'syncing' | 'offline' | 'unauthorized';
  pos: [number, number, number];
  heading: number;
  fade: number;
  thresholdS: number;
  thresholdTotal: number;
  slideRegistered: boolean;
  locomotion: { slidingSpeed: number; turningAngle: number; turningMethod: number; enableJumping: boolean } | null;
  transition: { to: string; stage: string } | null;
  focusDoor: string | null;
  captions: { status: string; caption: string; disabled: string | null; hint: string | null };
  zone: string;
  standing: number | null;
  plane: { x: number; z: number } | null;
  /** Which world is drawn: the hall (with its floor and previews) or the plane */
  shown: { hall: boolean; plane: boolean };
}
export const debug = (page: Page): Promise<Debug> => page.evaluate(() => (window as unknown as { __cathedral: { debug(): unknown } }).__cathedral.debug()) as Promise<Debug>;

export async function untilPhase(page: Page, phase: string, timeout = 60_000): Promise<void> {
  await page.waitForFunction((p) => (window as unknown as { __cathedral: { debug(): { phase: string } } }).__cathedral.debug().phase === p, phase, { timeout });
}

/** Wait for a fade between places to finish: the app ignores input while one runs, as a visitor would wait for it. */
export async function settled(page: Page): Promise<void> {
  await page.waitForFunction(() => (window as unknown as { __cathedral: { debug(): { transition: unknown } } }).__cathedral.debug().transition === null, null, { timeout: 30_000 });
}

/** Get to the cathedral on a return visit by skipping the threshold. */
export async function toCathedral(page: Page): Promise<void> {
  await page.click('#begin');
  await page.waitForSelector('#skip:not([hidden])', { timeout: 20_000 });
  await page.click('#skip');
  await untilPhase(page, 'cathedral');
  await settled(page);
}

/** Evaluate an expression on the app, e.g. app(page, "stand(0, -4)"). The app is window.__cathedral. */
export const app = <T = unknown>(page: Page, expr: string): Promise<T> => page.evaluate(`window.__cathedral.${expr}`) as Promise<T>;
