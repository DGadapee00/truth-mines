import { earn, emptyProgress, mergeProgress, parseProgress, setResume } from '../../../core/progress';
import type { Progress, Resume } from '../../../core/schema';
import { apiUrl, type WorkerConfig } from './trurl-client';
import type { DeviceStore } from './storage';

export class ApiError extends Error {
  constructor(readonly status: number) {
    super(`progress API: ${status}`);
  }
}

export interface ProgressApi {
  /** Merges into what the Worker holds and returns the merged progress: one call is a whole sync */
  put(p: Progress): Promise<Progress>;
}

/** PUT /api/progress on the Worker. Failures throw ApiError (status 0: no network). */
export function workerProgressApi(cfg: WorkerConfig): ProgressApi {
  const call = async (body: Progress): Promise<Progress> => {
    let res: Response;
    try {
      res = await (cfg.fetch ?? fetch)(apiUrl(cfg.workerUrl, '/api/progress'), {
        method: 'PUT',
        headers: { Authorization: `Bearer ${cfg.secret}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch {
      throw new ApiError(0);
    }
    if (!res.ok) throw new ApiError(res.status);
    try {
      return parseProgress(await res.json());
    } catch {
      throw new ApiError(502);
    }
  };
  return { put: call };
}

export type SyncStatus = 'local' | 'synced' | 'syncing' | 'offline' | 'unauthorized';

/**
 * The Worker keeps the record in Cloudflare KV, which refuses a second write to a key within a
 * second and allows a free account 1,000 writes a day. So a sync is one PUT, never a GET then a PUT,
 * changes are gathered into it rather than sent one by one, and two PUTs are never closer than this.
 */
export const MIN_PUT_INTERVAL_MS = 1000;
/** How long to gather changes before sending: an earned idea soon (the door should light on the other device too), a walked position much later */
export const EARN_DELAY_MS = 1000;
export const RESUME_DELAY_MS = 15000;
const RETRY_DELAY_MS = 1500;
const MAX_RETRIES = 3;

export interface Timers {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
}

const realTimers: Timers = { now: () => Date.now(), setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>) };

/**
 * The visitor's progress on this device. It loads from the device cache at once (so the
 * cathedral opens instantly and works offline), saves every change there, and syncs with the
 * Worker when it can: the union of what was earned on each device, the newest pathway entry
 * winning (core/progress.ts). A failed sync never loses anything and is retried on the next
 * change; a 401 stops syncing until the secret is changed.
 */
export function createProgressStore(deps: { device: DeviceStore; api: ProgressApi | null; now(): string; timers?: Timers }) {
  const timers = deps.timers ?? realTimers;
  let api = deps.api;
  let progress = deps.device.progress.read() ?? emptyProgress();
  let status: SyncStatus = api ? 'offline' : 'local';
  let stopped = false;
  let lastPutAt = -Infinity;
  let retries = 0;
  /** The sync that is waiting for its time, with the moment it is due */
  let waiting: { id: unknown; due: number; done: Promise<void>; finish: () => void } | null = null;
  let running: Promise<void> = Promise.resolve();
  const listeners = new Set<(p: Progress) => void>();

  const publish = () => {
    deps.device.progress.write(progress);
    for (const fn of [...listeners]) fn(progress);
  };

  const doSync = async (): Promise<void> => {
    if (!api || stopped) return;
    status = 'syncing';
    lastPutAt = timers.now();
    try {
      const merged = mergeProgress(progress, await api.put(progress));
      const changed = JSON.stringify(merged) !== JSON.stringify(progress);
      progress = merged;
      status = 'synced';
      retries = 0;
      if (changed) publish();
      else deps.device.progress.write(progress);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        stopped = true;
        status = 'unauthorized';
      } else {
        status = 'offline';
        if (e instanceof ApiError && e.status === 429 && retries++ < MAX_RETRIES) schedule(RETRY_DELAY_MS);
      }
    }
  };

  /** Send once `delayMs` from now, or when the last PUT is a second old if that is later; a sooner request moves it forward, a later one is absorbed */
  const schedule = (delayMs: number): Promise<void> => {
    const due = Math.max(timers.now() + delayMs, lastPutAt + MIN_PUT_INTERVAL_MS);
    if (waiting && waiting.due <= due) return waiting.done;
    let finish!: () => void;
    const done = new Promise<void>((r) => (finish = r));
    if (waiting) {
      timers.clearTimeout(waiting.id);
      const old = waiting;
      void done.then(old.finish);
    }
    const w = { id: undefined as unknown, due, done, finish };
    w.id = timers.setTimeout(() => {
      waiting = null;
      running = running.then(doSync).then(w.finish);
    }, Math.max(0, due - timers.now()));
    waiting = w;
    return done;
  };

  return {
    get: (): Progress => progress,
    syncStatus: (): SyncStatus => status,
    subscribe(fn: (p: Progress) => void): () => void {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    earn(ids: string[]): void {
      const next = earn(progress, ids, deps.now());
      if (next.earned.length === progress.earned.length) return;
      progress = next;
      retries = 0;
      publish();
      void schedule(EARN_DELAY_MS);
    },
    /** Record where the visitor stands in a plane. The same place again is not a change: nothing is saved or sent. */
    resume(plane: string, stretch: string, r: Resume): void {
      const was = progress.pathways[plane];
      if (was && was.stretch === stretch && was.resume.yaw === r.yaw && was.resume.pos.every((v, i) => v === r.pos[i])) return;
      progress = setResume(progress, plane, stretch, r, deps.now());
      retries = 0;
      publish();
      void schedule(RESUME_DELAY_MS);
    },
    /** Sync as soon as a second has passed since the last PUT; resolves when done (never rejects) */
    sync: (): Promise<void> => schedule(0),
    /** Resolves when any sync already waiting or running has finished */
    settled: (): Promise<void> => (waiting ? waiting.done : running),
    /** The secret was changed: syncing may be tried again */
    resumeSync(): void {
      stopped = false;
      if (api) status = 'offline';
    },
    /** The Worker address or secret changed (or was forgotten): use this API from now on, or none */
    setApi(next: ProgressApi | null): void {
      api = next;
      stopped = false;
      status = next ? 'offline' : 'local';
    },
  };
}

export type ProgressStore = ReturnType<typeof createProgressStore>;
