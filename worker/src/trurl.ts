import Anthropic from '@anthropic-ai/sdk';
import type { GroundingFile, TrurlRequest } from '../../core/schema';
import { doingDone } from '../../core/doing';
import type { Env } from './env';
import { buildMessages, buildSystem } from './prompt';
import { VerdictSplitter } from './verdict';

/** Fixed here: the client cannot choose the model, the prompt or the length. */
export const MODEL = 'claude-haiku-5-5';
export const MAX_TOKENS = 400;
/** Low effort keeps the first caption word near the 0.5 to 0.8 s the design budgets; raise it if the judging proves too shallow. */
export const EFFORT = 'low';

const enc = new TextEncoder();
const frame = (event: string, data: unknown) => enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

/**
 * The ids the visitor may be granted: what the model proposed, cut to what this moment can earn and
 * they do not already have, and only if the facts show the visitor did the activity in this visit.
 * Whatever Trurl is persuaded of, an explanation without the doing earns nothing.
 */
export function allowedEarned(proposed: string[] | null, req: TrurlRequest, grounding: GroundingFile): string[] {
  const moment = req.moment ? grounding.moments[req.moment] : undefined;
  if (!moment || !proposed || !doingDone(moment.kind, req.doing)) return [];
  return [...new Set(proposed)].filter((id) => moment.earns.includes(id) && !req.earned.includes(id));
}

/**
 * Trurl's reply as server-sent events: `text` ({delta}) as Claude writes, then one `verdict`
 * ({earned}) and `done`; on any failure a single generic `error` and no verdict. The verdict line
 * Claude ends with is never shown, and what it claims is filtered by `allowedEarned`.
 */
export function streamTrurl(req: TrurlRequest, env: Env, grounding: GroundingFile, fetchImpl: typeof fetch): Response {
  const abort = new AbortController();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const splitter = new VerdictSplitter();
      let stopReason: string | null = null;
      let finished = false;
      try {
        const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, fetch: fetchImpl, maxRetries: 0, timeout: 30_000 });
        const system = buildSystem(req, grounding);
        const upstream = await client.messages.create(
          {
            model: MODEL,
            max_tokens: MAX_TOKENS,
            system: [
              { type: 'text', text: system.persona, cache_control: { type: 'ephemeral' } },
              { type: 'text', text: system.grounding },
            ],
            messages: buildMessages(req),
            output_config: { effort: EFFORT },
            stream: true,
          },
          { signal: abort.signal },
        );
        for await (const event of upstream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            const shown = splitter.push(event.delta.text);
            if (shown) controller.enqueue(frame('text', { delta: shown }));
          } else if (event.type === 'message_delta') {
            stopReason = event.delta.stop_reason ?? null;
          } else if (event.type === 'message_stop') {
            finished = true;
          }
        }
        if (!finished || stopReason === 'refusal') throw new Error('incomplete');
        const end = splitter.end();
        if (end.text) controller.enqueue(frame('text', { delta: end.text }));
        const complete = stopReason === 'end_turn' || stopReason === 'stop_sequence';
        controller.enqueue(frame('verdict', { earned: complete ? allowedEarned(end.earned, req, grounding) : [] }));
        controller.enqueue(frame('done', {}));
      } catch (e) {
        if (!abort.signal.aborted) console.error('trurl: upstream failed', e instanceof Anthropic.APIError ? e.status : 'no response');
        try {
          controller.enqueue(frame('error', { message: 'Trurl lost the thread.' }));
        } catch {
          // the client has already gone
        }
      }
      try {
        controller.close();
      } catch {
        // already closed by a cancel
      }
    },
    cancel() {
      abort.abort();
    },
  });
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' } });
}
