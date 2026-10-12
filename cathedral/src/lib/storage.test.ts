import { describe, expect, it } from 'vitest';
import { emptyProgress, earn } from '../../../core/progress';
import { createDeviceStore, type KeyValue } from './storage';

class MemoryStorage implements KeyValue {
  data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}

const throwing: KeyValue = {
  getItem() {
    throw new Error('blocked');
  },
  setItem() {
    throw new Error('blocked');
  },
  removeItem() {
    throw new Error('blocked');
  },
};

describe('device store', () => {
  it('keeps the secret and the Worker URL, and forgets them on request', () => {
    const s = new MemoryStorage();
    const store = createDeviceStore(() => s);
    expect(store.secret.get()).toBeNull();
    store.secret.set('abc');
    store.workerUrl.set('https://w.example');
    expect(store.secret.get()).toBe('abc');
    expect(store.workerUrl.get()).toBe('https://w.example');
    store.forget();
    expect(store.secret.get()).toBeNull();
    expect(store.workerUrl.get()).toBeNull();
  });

  it('forgetting the device keeps the saved progress and the threshold flag, which are not credentials', () => {
    const s = new MemoryStorage();
    const store = createDeviceStore(() => s);
    store.secret.set('abc');
    store.thresholdSeen.set();
    store.progress.write(earn(emptyProgress(), ['1arith'], '2026-10-11T08:00:00Z'));
    store.forget();
    expect(store.thresholdSeen.get()).toBe(true);
    expect(store.progress.read()?.earned).toEqual(['1arith']);
  });

  it('remembers that the threshold has been played', () => {
    const s = new MemoryStorage();
    const store = createDeviceStore(() => s);
    expect(store.thresholdSeen.get()).toBe(false);
    store.thresholdSeen.set();
    expect(store.thresholdSeen.get()).toBe(true);
  });

  it('round-trips progress and reads corrupt progress as nothing', () => {
    const s = new MemoryStorage();
    const store = createDeviceStore(() => s);
    const p = earn(emptyProgress(), ['df-prm'], '2026-10-11T08:00:00Z');
    store.progress.write(p);
    expect(store.progress.read()).toEqual(p);
    s.setItem('truth-mines.progress', '{corrupt');
    expect(store.progress.read()).toBeNull();
    s.setItem('truth-mines.progress', JSON.stringify({ schema_version: 9 }));
    expect(store.progress.read()).toBeNull();
  });

  it('never throws when storage is blocked: reads come back empty, the threshold is not "seen", writes are dropped', () => {
    for (const get of [() => throwing, () => undefined, () => { throw new Error('no storage at all'); }]) {
      const store = createDeviceStore(get);
      expect(store.secret.get()).toBeNull();
      expect(store.workerUrl.get()).toBeNull();
      expect(store.thresholdSeen.get()).toBe(false);
      expect(store.progress.read()).toBeNull();
      expect(() => {
        store.secret.set('x');
        store.workerUrl.set('y');
        store.thresholdSeen.set();
        store.progress.write(emptyProgress());
        store.forget();
      }).not.toThrow();
    }
  });
});
