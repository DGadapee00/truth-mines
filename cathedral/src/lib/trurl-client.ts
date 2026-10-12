import type { TrurlRequest } from '../../../core/schema';
import { parseSse } from './sse';

export interface WorkerConfig {
  /** The Worker's address, e.g. https://trurl.you.workers.dev */
  workerUrl: string;
  /** The app secret, entered once on this device */
  secret: string;
  fetch?: typeof fetch;
}

export type TrurlEvent = { type: 'text'; delta: string } | { type: 'verdict'; earned: string[] } | { type: 'done' } | { type: 'error'; status: number };

export const apiUrl = (workerUrl: string, path: string) => `${workerUrl.replace(/\/+$/, '')}${path}`;

async function* body(res: Response): AsyncGenerator<Uint8Array> {
  if (!res.body) return;
  const reader = res.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      yield value;
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Ask Trurl (POST /api/trurl) and stream the reply. Failures are events, not exceptions: an HTTP
 * status (0 for no network) that the caller can act on, never a body from upstream. Aborting ends
 * the stream quietly.
 */
export async function* askTrurl(cfg: WorkerConfig, req: TrurlRequest, signal?: AbortSignal): AsyncGenerator<TrurlEvent> {
  if (!cfg.secret) return yield { type: 'error', status: 401 };
  if (!cfg.workerUrl) return yield { type: 'error', status: 0 };
  let res: Response;
  try {
    res = await (cfg.fetch ?? fetch)(apiUrl(cfg.workerUrl, '/api/trurl'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
      signal,
    });
  } catch (e) {
    if (signal?.aborted || (e instanceof DOMException && e.name === 'AbortError')) return;
    return yield { type: 'error', status: 0 };
  }
  if (!res.ok) return yield { type: 'error', status: res.status };
  let finished = false;
  try {
    for await (const e of parseSse(body(res))) {
      const d = e.data as { delta?: unknown; earned?: unknown };
      if (e.event === 'text' && typeof d.delta === 'string') yield { type: 'text', delta: d.delta };
      else if (e.event === 'verdict' && Array.isArray(d.earned)) yield { type: 'verdict', earned: d.earned.filter((x): x is string => typeof x === 'string') };
      else if (e.event === 'done') {
        finished = true;
        yield { type: 'done' };
      } else if (e.event === 'error') {
        finished = true;
        yield { type: 'error', status: res.status };
      }
    }
  } catch (e) {
    if (signal?.aborted || (e instanceof DOMException && e.name === 'AbortError')) return;
    finished = true;
    yield { type: 'error', status: 0 };
  }
  if (!finished && !signal?.aborted) yield { type: 'error', status: res.status };
}
