/** A stand-in for api.anthropic.com: serves a scripted Messages stream and records what it was sent. */
export interface Sent {
  url: string;
  headers: Headers;
  body: Record<string, unknown>;
  signal: AbortSignal | null | undefined;
}

export interface Script {
  /** The reply's text, in the chunks it arrives in */
  chunks?: string[];
  stopReason?: string;
  /** End the stream without message_stop, as a dropped connection would */
  cut?: boolean;
  /** Answer with this HTTP status and a body instead of a stream */
  status?: number;
  body?: string;
  /** Emit a thinking block before the text, as an adaptive-thinking model may */
  thinking?: boolean;
}

const sse = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

export function anthropicStream(s: Script): string {
  const out = [
    sse('message_start', { type: 'message_start', message: { id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-haiku-5-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 1 } } }),
  ];
  let index = 0;
  if (s.thinking) {
    out.push(sse('content_block_start', { type: 'content_block_start', index, content_block: { type: 'thinking', thinking: '', signature: '' } }));
    out.push(sse('content_block_delta', { type: 'content_block_delta', index, delta: { type: 'thinking_delta', thinking: 'SECRET REASONING' } }));
    out.push(sse('content_block_stop', { type: 'content_block_stop', index }));
    index++;
  }
  out.push(sse('content_block_start', { type: 'content_block_start', index, content_block: { type: 'text', text: '' } }));
  for (const text of s.chunks ?? []) out.push(sse('content_block_delta', { type: 'content_block_delta', index, delta: { type: 'text_delta', text } }));
  if (s.cut) return out.join('');
  out.push(sse('content_block_stop', { type: 'content_block_stop', index }));
  out.push(sse('message_delta', { type: 'message_delta', delta: { stop_reason: s.stopReason ?? 'end_turn', stop_sequence: null }, usage: { output_tokens: 12 } }));
  out.push(sse('message_stop', { type: 'message_stop' }));
  return out.join('');
}

export function stubFetch(script: Script): { fetch: typeof fetch; sent: Sent[] } {
  const sent: Sent[] = [];
  const impl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    sent.push({ url, headers: new Headers(init?.headers), body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>, signal: init?.signal });
    if (script.status && script.status !== 200) return new Response(script.body ?? 'internal detail that must not leak', { status: script.status });
    return new Response(anthropicStream(script), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
  };
  return { fetch: impl as typeof fetch, sent };
}

export interface ClientEvent {
  event: string;
  data: Record<string, unknown>;
}

/** Read a Worker SSE response to the end. */
export async function readEvents(res: Response): Promise<ClientEvent[]> {
  const text = await res.text();
  return text
    .split('\n\n')
    .filter(Boolean)
    .map((block) => {
      const event = /^event: (.*)$/m.exec(block)?.[1] ?? '';
      const data = JSON.parse(/^data: (.*)$/m.exec(block)?.[1] ?? '{}') as Record<string, unknown>;
      return { event, data };
    });
}
