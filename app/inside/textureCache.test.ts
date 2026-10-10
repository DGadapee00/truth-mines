import { describe, expect, it } from 'vitest';
import { createLruCache, type Disposable } from './textureCache';

function fake(id: string, disposed: string[]): Disposable & { id: string } {
  return {
    id,
    dispose() {
      disposed.push(id);
    },
  };
}

describe('statement texture LRU', () => {
  it('returns a hit without disposing it, and treats the hit as newest', () => {
    const disposed: string[] = [];
    const cache = createLruCache<Disposable & { id: string }>(2);
    cache.set('a', fake('a', disposed));
    cache.set('b', fake('b', disposed));
    expect(cache.get('a')?.id).toBe('a');
    expect(disposed).toEqual([]);
    cache.set('c', fake('c', disposed));
    expect(disposed).toEqual(['b']);
    expect(cache.get('a')?.id).toBe('a');
    expect(cache.get('b')).toBeUndefined();
  });

  it('disposes the previous value when a key is replaced', () => {
    const disposed: string[] = [];
    const cache = createLruCache<Disposable & { id: string }>(2);
    cache.set('a', fake('a', disposed));
    cache.set('a', fake('a2', disposed));
    expect(disposed).toEqual(['a']);
    expect(cache.get('a')?.id).toBe('a2');
    expect(cache.size).toBe(1);
  });

  it('disposes every entry past the cap, oldest first', () => {
    const disposed: string[] = [];
    const cache = createLruCache<Disposable & { id: string }>(2);
    cache.set('a', fake('a', disposed));
    cache.set('b', fake('b', disposed));
    cache.set('c', fake('c', disposed));
    cache.set('d', fake('d', disposed));
    expect(disposed).toEqual(['a', 'b']);
    expect(cache.size).toBe(2);
    expect(cache.get('c')?.id).toBe('c');
    expect(cache.get('d')?.id).toBe('d');
  });
});
