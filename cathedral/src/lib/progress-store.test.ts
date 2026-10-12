import { describe, expect, it } from 'vitest';
import { earn, emptyProgress, mergeProgress } from '../../../core/progress';
import type { Progress } from '../../../core/schema';
import { ApiError, EARN_DELAY_MS, MIN_PUT_INTERVAL_MS, RESUME_DELAY_MS, createProgressStore, type ProgressApi, type Timers } from './progress-store';
import { createDeviceStore, type KeyValue } from './storage';

const T = (n: number) => `2026-10-11T0${n}:00:00Z`;

class Mem implements KeyValue {
  d = new Map<string, string>();
  getItem(k: string) {
    return this.d.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.d.set(k, v);
  }
  removeItem(k: string) {
    this.d.delete(k);
  }
}

/**
 * Virtual time: a timer that is waited for moves the clock to its time at once, so a test never
 * sleeps and can still say exactly when each PUT went out.
 */
function virtualTimers() {
  let t = 1_000_000;
  const pending: { id: number; at: number; fn: () => void }[] = [];
  let next = 1;
  const timers: Timers = {
    now: () => t,
    setTimeout(fn, ms) {
      const id = next++;
      pending.push({ id, at: t + ms, fn });
      queueMicrotask(run);
      return id;
    },
    clearTimeout(id) {
      const i = pending.findIndex((p) => p.id === id);
      if (i >= 0) pending.splice(i, 1);
    },
  };
  // Run the earliest timer after the microtasks of the test have had their turn
  const run = () => {
    setTimeout(() => {
      if (!pending.length) return;
      pending.sort((a, b) => a.at - b.at);
      const p = pending.shift()!;
      t = Math.max(t, p.at);
      p.fn();
      if (pending.length) run();
    }, 0);
  };
  return { timers, at: () => t, advance: (ms: number) => (t += ms) };
}

/** A Worker's PUT /api/progress in memory: it merges, as the real one does, and records when each PUT came. */
function fakeApi(initial: Progress = emptyProgress(), clock: () => number = () => 0) {
  let server = initial;
  const calls: string[] = [];
  const putTimes: number[] = [];
  const api: ProgressApi & { fail?: Error | null; server(): Progress } = {
    fail: null,
    server: () => server,
    async put(p) {
      calls.push('put');
      putTimes.push(clock());
      if (api.fail) throw api.fail;
      server = mergeProgress(server, p);
      return server;
    },
  };
  return { api, calls, putTimes };
}

let clock = 0;
const now = () => T(++clock % 9);

function setup(api: ProgressApi | null, mem = new Mem(), vt = virtualTimers()) {
  const device = createDeviceStore(() => mem);
  return { store: createProgressStore({ device, api, now, timers: vt.timers }), device, mem, vt };
}

describe('the progress store', () => {
  it('recording the same place again changes nothing and sends nothing, so standing still in a plane costs no writes', async () => {
    const { api, calls } = fakeApi();
    const { store } = setup(api);
    await store.sync();
    store.resume('number-theory', 'nt-1', { pos: [1, 0, 2], yaw: 0.5 });
    await store.settled();
    const saved = store.get();
    const before = calls.length;
    let published = 0;
    store.subscribe(() => published++);
    for (let i = 0; i < 5; i++) store.resume('number-theory', 'nt-1', { pos: [1, 0, 2], yaw: 0.5 });
    await store.settled();
    expect(calls.length).toBe(before);
    expect(published).toBe(0);
    expect(store.get()).toEqual(saved);
    store.resume('number-theory', 'nt-1', { pos: [1, 0, 2.5], yaw: 0.5 });
    await store.settled();
    expect(calls.length).toBeGreaterThan(before);
    expect(store.get().pathways['number-theory']?.resume.pos).toEqual([1, 0, 2.5]);
  });

  it('starts from the device cache at once, before any network', () => {
    const mem = new Mem();
    createDeviceStore(() => mem).progress.write(earn(emptyProgress(), ['1arith'], T(1)));
    const { store } = setup(null, mem);
    expect(store.get().earned).toEqual(['1arith']);
  });

  it('starts empty on a first visit', () => {
    expect(setup(null).store.get()).toEqual(emptyProgress());
  });

  it('earning saves to the device and tells subscribers', () => {
    const { store, device } = setup(null);
    const seen: string[][] = [];
    store.subscribe((p) => seen.push(p.earned));
    store.earn(['df-prm']);
    expect(store.get().earned).toEqual(['df-prm']);
    expect(device.progress.read()?.earned).toEqual(['df-prm']);
    expect(seen).toEqual([['df-prm']]);
  });

  it('earning what is already earned changes nothing and tells no one', () => {
    const { store } = setup(null);
    store.earn(['df-prm']);
    const seen: unknown[] = [];
    store.subscribe((p) => seen.push(p));
    store.earn(['df-prm']);
    expect(seen).toEqual([]);
  });

  it('remembers where the visitor stood in a pathway', () => {
    const { store } = setup(null);
    store.resume('number-theory', 'nt-1', { pos: [0, 0, 12.5], yaw: 0.5 });
    expect(store.get().pathways['number-theory']).toMatchObject({ stretch: 'nt-1', resume: { pos: [0, 0, 12.5], yaw: 0.5 } });
  });

  it('syncs: pulls what the Worker has, merges it with what is here and pushes the union', async () => {
    const remote = earn(emptyProgress(), ['infpn'], T(2));
    const { api } = fakeApi(remote);
    const { store } = setup(api);
    store.earn(['1arith']);
    await store.sync();
    expect(store.get().earned).toEqual(['1arith', 'infpn']);
    expect(api.server().earned).toEqual(['1arith', 'infpn']);
    expect(store.syncStatus()).toBe('synced');
  });

  it('two devices that earned different things offline converge on the union', async () => {
    const { api } = fakeApi();
    const a = setup(api);
    const b = setup(api);
    a.store.earn(['1arith']);
    b.store.earn(['df-prm']);
    await a.store.sync();
    await b.store.sync();
    await a.store.sync();
    expect(a.store.get().earned).toEqual(['1arith', 'df-prm']);
    expect(b.store.get().earned).toEqual(['1arith', 'df-prm']);
    expect(api.server().earned).toEqual(['1arith', 'df-prm']);
  });

  it('keeps working offline: a failed sync keeps local progress and is retried on the next change', async () => {
    const { api, calls } = fakeApi();
    const { store, device } = setup(api);
    api.fail = new ApiError(0);
    store.earn(['1arith']);
    await store.sync();
    expect(store.syncStatus()).toBe('offline');
    expect(store.get().earned).toEqual(['1arith']);
    expect(device.progress.read()?.earned).toEqual(['1arith']);
    api.fail = null;
    store.earn(['df-prm']);
    await store.settled();
    expect(api.server().earned).toEqual(['1arith', 'df-prm']);
    expect(store.syncStatus()).toBe('synced');
    expect(calls.filter((c) => c === 'put').length).toBeGreaterThanOrEqual(1);
  });

  it('on a 401 stops syncing and says so, without retrying in a loop', async () => {
    const { api, calls } = fakeApi();
    const { store } = setup(api);
    api.fail = new ApiError(401);
    await store.sync();
    expect(store.syncStatus()).toBe('unauthorized');
    const n = calls.length;
    store.earn(['1arith']);
    await store.settled();
    await store.sync();
    expect(calls.length).toBe(n);
    expect(store.get().earned).toEqual(['1arith']); // still saved on the device
    store.resumeSync();
    api.fail = null;
    await store.sync();
    expect(store.syncStatus()).toBe('synced');
  });

  it('runs fine with no Worker at all', async () => {
    const { store } = setup(null);
    store.earn(['1arith']);
    await store.sync();
    expect(store.syncStatus()).toBe('local');
    expect(store.get().earned).toEqual(['1arith']);
  });

  it('does not lose a pathway saved on this device when the Worker’s copy is older', async () => {
    const { api } = fakeApi(earn(emptyProgress(), ['infpn'], T(1)));
    const { store } = setup(api);
    store.resume('number-theory', 'nt-1', { pos: [0, 0, 7], yaw: 0 });
    await store.sync();
    expect(store.get().pathways['number-theory']!.resume.pos).toEqual([0, 0, 7]);
    expect(api.server().pathways['number-theory']!.resume.pos).toEqual([0, 0, 7]);
  });

  it('switches Worker credentials at runtime: none means local only, a new API syncs again, even after a 401', async () => {
    const { api } = fakeApi();
    const { store } = setup(null);
    store.earn(['1arith']);
    expect(store.syncStatus()).toBe('local');
    store.setApi(api);
    expect(store.syncStatus()).toBe('offline');
    await store.sync();
    expect(api.server().earned).toEqual(['1arith']);
    const bad = fakeApi();
    bad.api.fail = new ApiError(401);
    store.setApi(bad.api);
    await store.sync();
    expect(store.syncStatus()).toBe('unauthorized');
    store.setApi(api);
    await store.sync();
    expect(store.syncStatus()).toBe('synced');
    store.setApi(null);
    expect(store.syncStatus()).toBe('local');
  });

  it('survives blocked device storage', () => {
    const { store } = setup(null, { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); }, removeItem() { throw new Error('x'); } } as unknown as Mem);
    expect(() => store.earn(['1arith'])).not.toThrow();
    expect(store.get().earned).toEqual(['1arith']);
  });

  describe('writes: the Worker keeps the record in KV, one write a second per key and 1,000 a day', () => {
    it('a sync is one PUT and nothing else: there is no GET before it', async () => {
      const { api, calls } = fakeApi(earn(emptyProgress(), ['infpn'], T(2)));
      const { store } = setup(api);
      store.earn(['1arith']);
      await store.sync();
      expect(calls).toEqual(['put']);
      expect(store.get().earned).toEqual(['1arith', 'infpn']); // the PUT’s answer carried the other device’s ideas
    });

    it('changes made together go out together: a burst is one PUT, carrying all of it', async () => {
      const vt = virtualTimers();
      const { api, calls } = fakeApi(emptyProgress(), vt.timers.now);
      const { store } = setup(api, new Mem(), vt);
      store.earn(['1arith']);
      store.resume('number-theory', 'nt-1', { pos: [0, 0, 3], yaw: 0 });
      store.earn(['df-prm']);
      store.resume('number-theory', 'nt-1', { pos: [0, 0, 4], yaw: 0 });
      await store.settled();
      expect(calls).toEqual(['put']);
      expect(api.server().earned).toEqual(['1arith', 'df-prm']);
      expect(api.server().pathways['number-theory']!.resume.pos).toEqual([0, 0, 4]);
    });

    it('no two PUTs are less than a second apart, however the changes and syncs come', async () => {
      const vt = virtualTimers();
      const { api, putTimes } = fakeApi(emptyProgress(), vt.timers.now);
      const { store } = setup(api, new Mem(), vt);
      for (let i = 0; i < 12; i++) {
        store.earn([`label${i}`]);
        void store.sync();
        vt.advance(137);
        await store.settled();
        store.resume('number-theory', 'nt-1', { pos: [i, 0, 0], yaw: 0 });
        await store.sync();
      }
      await store.settled();
      expect(putTimes.length).toBeGreaterThan(3);
      for (let i = 1; i < putTimes.length; i++) expect(putTimes[i]! - putTimes[i - 1]!).toBeGreaterThanOrEqual(MIN_PUT_INTERVAL_MS);
      expect(api.server().earned).toHaveLength(12);
    });

    it('an earned idea goes out soon; a walked position waits much longer, and walking does not delay the idea', async () => {
      const vt = virtualTimers();
      const { api, putTimes } = fakeApi(emptyProgress(), vt.timers.now);
      const { store } = setup(api, new Mem(), vt);
      const t0 = vt.at();
      store.resume('number-theory', 'nt-1', { pos: [0, 0, 1], yaw: 0 });
      vt.advance(1000);
      store.earn(['1arith']);
      await store.settled();
      expect(putTimes).toEqual([t0 + 1000 + EARN_DELAY_MS]);
      store.resume('number-theory', 'nt-1', { pos: [0, 0, 2], yaw: 0 });
      const t1 = vt.at();
      await store.settled();
      expect(putTimes[1]).toBe(Math.max(t1 + RESUME_DELAY_MS, putTimes[0]! + MIN_PUT_INTERVAL_MS));
    });

    it('a PUT the Worker answers with 429 (saved a moment ago) is tried again shortly, a few times at most', async () => {
      const vt = virtualTimers();
      const { api, putTimes } = fakeApi(emptyProgress(), vt.timers.now);
      const { store } = setup(api, new Mem(), vt);
      api.fail = new ApiError(429);
      store.earn(['1arith']);
      for (let i = 0; i < 6; i++) await store.settled(); // each failed PUT schedules the next try
      expect(putTimes.length).toBe(4); // the first and three retries
      for (let i = 1; i < putTimes.length; i++) expect(putTimes[i]! - putTimes[i - 1]!).toBeGreaterThanOrEqual(MIN_PUT_INTERVAL_MS);
      api.fail = null;
      store.earn(['df-prm']);
      await store.settled();
      expect(api.server().earned).toEqual(['1arith', 'df-prm']);
    });
  });
});
