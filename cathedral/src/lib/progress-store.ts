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
  get(): Promise<Progress>;
  /** Merges into what the Worker holds and returns the merged progress */
  put(p: Progress): Promise<Progress>;
}

/** GET and PUT /api/progress on the Worker. Failures throw ApiError (status 0: no network). */
export function workerProgressApi(cfg: WorkerConfig): ProgressApi {
  const call = async (method: 'GET' | 'PUT', body?: Progress): Promise<Progress> => {
    let res: Response;
    try {
      res = await (cfg.fetch ?? fetch)(apiUrl(cfg.workerUrl, '/api/progress'), {
        method,
        headers: { Authorization: `Bearer ${cfg.secret}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
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
  return { get: () => call('GET'), put: (p) => call('PUT', p) };
}

export type SyncStatus = 'local' | 'synced' | 'syncing' | 'offline' | 'unauthorized';

/**
 * The visitor's progress on this device. It loads from the device cache at once (so the
 * cathedral opens instantly and works offline), saves every change there, and syncs with the
 * Worker when it can: the union of what was earned on each device, the newest pathway entry
 * winning (core/progress.ts). A failed sync never loses anything and is retried on the next
 * change; a 401 stops syncing until the secret is changed.
 */
export function createProgressStore(deps: { device: DeviceStore; api: ProgressApi | null; now(): string }) {
  let api = deps.api;
  let progress = deps.device.progress.read() ?? emptyProgress();
  let status: SyncStatus = api ? 'offline' : 'local';
  let stopped = false;
  let chain: Promise<void> = Promise.resolve();
  const listeners = new Set<(p: Progress) => void>();

  const publish = () => {
    deps.device.progress.write(progress);
    for (const fn of [...listeners]) fn(progress);
  };

  const doSync = async (): Promise<void> => {
    if (!api) return;
    if (stopped) return;
    status = 'syncing';
    try {
      progress = mergeProgress(progress, await api.get());
      const merged = mergeProgress(progress, await api.put(progress));
      const changed = JSON.stringify(merged) !== JSON.stringify(progress);
      progress = merged;
      status = 'synced';
      if (changed) publish();
      else deps.device.progress.write(progress);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        stopped = true;
        status = 'unauthorized';
      } else status = 'offline';
    }
  };
  const queue = (): Promise<void> => (chain = chain.then(doSync));

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
      publish();
      void queue();
    },
    /** Record where the visitor stands in a plane. The same place again is not a change: nothing is saved or sent. */
    resume(plane: string, stretch: string, r: Resume): void {
      const was = progress.pathways[plane];
      if (was && was.stretch === stretch && was.resume.yaw === r.yaw && was.resume.pos.every((v, i) => v === r.pos[i])) return;
      progress = setResume(progress, plane, stretch, r, deps.now());
      publish();
      void queue();
    },
    /** Sync now; resolves when done (never rejects) */
    sync: (): Promise<void> => queue(),
    /** Resolves when any sync already queued has finished */
    settled: (): Promise<void> => chain,
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
