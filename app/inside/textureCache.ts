/** A small LRU of disposable values. The statement-wall textures use one of these. */
export interface Disposable {
  dispose(): void;
}

export function createLruCache<T extends Disposable>(cap: number) {
  if (cap < 1) throw new Error('cache cap must be at least 1');
  const map = new Map<string, T>();
  return {
    get size() {
      return map.size;
    },
    /** The value for `key`, or undefined. A hit becomes the newest entry. */
    get(key: string): T | undefined {
      const value = map.get(key);
      if (value === undefined) return undefined;
      map.delete(key);
      map.set(key, value);
      return value;
    },
    /** Store `value`. The previous value at `key`, and entries past `cap`, are disposed. */
    set(key: string, value: T) {
      const previous = map.get(key);
      if (previous !== undefined) {
        map.delete(key);
        if (previous !== value) previous.dispose();
      }
      map.set(key, value);
      while (map.size > cap) {
        const oldest = map.keys().next().value;
        if (oldest === undefined) break;
        const evicted = map.get(oldest);
        map.delete(oldest);
        evicted?.dispose();
      }
    },
  };
}

/** How many statement-wall textures stay on the GPU. Older ones are disposed. */
export const STATEMENT_TEXTURE_CAP = 32;
