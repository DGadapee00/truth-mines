import { parseProgress } from '../../../core/progress';
import type { Progress } from '../../../core/schema';

/** The slice of localStorage the app uses. */
export interface KeyValue {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const KEYS = {
  secret: 'truth-mines.secret',
  workerUrl: 'truth-mines.worker',
  thresholdSeen: 'truth-mines.threshold-seen',
  progress: 'truth-mines.progress',
} as const;

/**
 * Per-device conveniences in localStorage: the app secret (entered once, never built into the
 * app), the Worker's address, whether the threshold has been played here, and the last known
 * progress. localStorage can be missing or can throw (private windows, blocked site data), so
 * every access is guarded: the app then simply behaves as on a first visit and never crashes.
 */
export function createDeviceStore(getStorage: () => KeyValue | undefined = () => globalThis.localStorage) {
  const store = (): KeyValue | null => {
    try {
      return getStorage() ?? null;
    } catch {
      return null;
    }
  };
  const read = (key: string): string | null => {
    try {
      return store()?.getItem(key) ?? null;
    } catch {
      return null;
    }
  };
  const write = (key: string, value: string): void => {
    try {
      store()?.setItem(key, value);
    } catch {
      // the value simply isn't kept
    }
  };
  const remove = (key: string): void => {
    try {
      store()?.removeItem(key);
    } catch {
      // nothing to remove
    }
  };
  return {
    secret: { get: () => read(KEYS.secret), set: (v: string) => write(KEYS.secret, v) },
    workerUrl: { get: () => read(KEYS.workerUrl), set: (v: string) => write(KEYS.workerUrl, v) },
    thresholdSeen: { get: () => read(KEYS.thresholdSeen) === '1', set: () => write(KEYS.thresholdSeen, '1') },
    progress: {
      read(): Progress | null {
        const raw = read(KEYS.progress);
        if (raw === null) return null;
        try {
          return parseProgress(JSON.parse(raw));
        } catch {
          return null;
        }
      },
      write: (p: Progress) => write(KEYS.progress, JSON.stringify(p)),
    },
    /** "Forget this device": the credentials go; progress and the threshold flag stay. */
    forget(): void {
      remove(KEYS.secret);
      remove(KEYS.workerUrl);
    },
  };
}

export type DeviceStore = ReturnType<typeof createDeviceStore>;
