import { describe, expect, it } from 'vitest';
import { earn, emptyProgress, mergeProgress } from '../../../core/progress';
import type { Progress } from '../../../core/schema';
import { ApiError, createProgressStore, type ProgressApi } from './progress-store';
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

/** A Worker's /api/progress in memory: PUT merges, as the real one does. */
function fakeApi(initial: Progress = emptyProgress()) {
  let server = initial;
  const calls: string[] = [];
  const api: ProgressApi & { fail?: Error | null; server(): Progress } = {
    fail: null,
    server: () => server,
    async get() {
      calls.push('get');
      if (api.fail) throw api.fail;
      return server;
    },
    async put(p) {
      calls.push('put');
      if (api.fail) throw api.fail;
      server = mergeProgress(server, p);
      return server;
    },
  };
  return { api, calls };
}

let clock = 0;
const now = () => T(++clock % 9);

function setup(api: ProgressApi | null, mem = new Mem()) {
  const device = createDeviceStore(() => mem);
  return { store: createProgressStore({ device, api, now }), device, mem };
}

describe('the progress store', () => {
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

  it('survives blocked device storage', () => {
    const { store } = setup(null, { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); }, removeItem() { throw new Error('x'); } } as unknown as Mem);
    expect(() => store.earn(['1arith'])).not.toThrow();
    expect(store.get().earned).toEqual(['1arith']);
  });
});
