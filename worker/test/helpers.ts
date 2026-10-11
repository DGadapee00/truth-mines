import type { Env, KVLike } from '../src/env';

export class MemoryKV implements KVLike {
  readonly data = new Map<string, string>();
  failing = false;
  async get(key: string): Promise<string | null> {
    if (this.failing) throw new Error('kv down');
    return this.data.get(key) ?? null;
  }
  async put(key: string, value: string): Promise<void> {
    if (this.failing) throw new Error('kv down');
    this.data.set(key, value);
  }
}

/** Fake keys: obviously not real, and shaped so the secret scan would not mistake them for real ones. */
export const SECRET = 'test-app-secret-0123456789abcdef';
export const FAKE_ANTHROPIC_KEY = 'fake-anthropic-key-for-tests';
export const FAKE_XAI_KEY = 'fake-xai-key-for-tests';

export function makeEnv(over: Partial<Env> = {}): Env & { PROGRESS: MemoryKV } {
  return {
    PROGRESS: new MemoryKV(),
    TRURL_APP_SECRET: SECRET,
    ANTHROPIC_API_KEY: FAKE_ANTHROPIC_KEY,
    XAI_API_KEY: FAKE_XAI_KEY,
    ALLOWED_ORIGINS: 'https://truth-mines.example',
    ...over,
  } as Env & { PROGRESS: MemoryKV };
}

export function req(path: string, init: RequestInit & { auth?: string | false } = {}): Request {
  const { auth = SECRET, ...rest } = init;
  const headers = new Headers(rest.headers);
  if (auth !== false && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${auth}`);
  return new Request(`https://worker.test${path}`, { ...rest, headers });
}
