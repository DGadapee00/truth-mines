import type { GroundingFile, TrurlRequest, TrurlTurn } from '../../core/schema';
import { TRURL_SCHEMA_VERSION } from '../../core/schema';

/** A request the Worker refuses, with the HTTP status to answer. */
export class RequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const KEYS = new Set(['schema_version', 'plane', 'stretch', 'moment', 'landmark', 'looking_at', 'earned', 'dialogue', 'utterance']);
const LOOKING = /^[a-z]{2,12}:[A-Za-z0-9._-]{1,40}$/;
export const MAX_TEXT = 600;
export const MAX_TURNS = 12;
const MAX_EARNED = 500;

const bad = (message: string): never => {
  throw new RequestError(400, message);
};

function place(v: unknown, field: string): string | null {
  if (v === null) return null;
  if (typeof v !== 'string' || !v) return bad(`${field} must be a string or null`);
  return v;
}

/**
 * Check a client request against the grounding and return a clean copy. The client may say only
 * where the visitor is and what was said; it cannot choose the model, the prompt or the token limit,
 * and every place it names must exist and fit together.
 */
export function parseTrurlRequest(raw: unknown, grounding: GroundingFile): TrurlRequest {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return bad('the request must be a JSON object');
  const r = raw as Record<string, unknown>;
  for (const k of Object.keys(r)) if (!KEYS.has(k)) return bad(`unknown field ${k}`);
  if (r.schema_version !== TRURL_SCHEMA_VERSION) return bad(`schema version ${String(r.schema_version)} is not understood`);

  const plane = place(r.plane, 'plane');
  const stretch = place(r.stretch, 'stretch');
  const moment = place(r.moment, 'moment');
  const landmark = place(r.landmark, 'landmark');
  if (plane !== null && !(plane in grounding.planes)) return bad('unknown plane');
  if (stretch !== null) {
    if (plane === null) return bad('a stretch needs its plane');
    if (!Object.values(grounding.moments).some((m) => m.plane === plane && m.stretch === stretch)) return bad('unknown stretch for that plane');
  }
  if (moment !== null) {
    const m = grounding.moments[moment];
    if (!m) return bad('unknown moment');
    if (stretch === null) return bad('a moment needs its stretch');
    if (m.plane !== plane || m.stretch !== stretch) return bad('that moment is not in that stretch');
  }
  if (landmark !== null) {
    if (!(landmark in grounding.landmarks)) return bad('unknown landmark');
    const inStretch = Object.values(grounding.moments).some((m) => m.plane === plane && m.stretch === stretch && m.landmarks.includes(landmark));
    if (!inStretch) return bad('that landmark is not in that stretch');
  }

  const lookingAt = r.looking_at === null || r.looking_at === undefined ? null : r.looking_at;
  if (lookingAt !== null && (typeof lookingAt !== 'string' || !LOOKING.test(lookingAt))) return bad('looking_at is malformed');

  if (!Array.isArray(r.earned) || r.earned.length > MAX_EARNED || !r.earned.every((x) => typeof x === 'string' && x.length > 0 && x.length <= 80)) return bad('earned is malformed');

  if (!Array.isArray(r.dialogue)) return bad('dialogue must be a list');
  const turns: TrurlTurn[] = r.dialogue.map((t: unknown) => {
    const o = t as { role?: unknown; text?: unknown } | null;
    if (!o || (o.role !== 'user' && o.role !== 'trurl') || typeof o.text !== 'string') return bad('dialogue holds a turn that is not {role, text}');
    return { role: o.role as TrurlTurn['role'], text: (o.text as string).trim().slice(0, MAX_TEXT) };
  });
  let dialogue = turns.filter((t) => t.text).slice(-MAX_TURNS);
  while (dialogue[0]?.role === 'trurl') dialogue = dialogue.slice(1);

  if (typeof r.utterance !== 'string') return bad('utterance must be text');
  const utterance = r.utterance.trim();
  if (!utterance) return bad('utterance is empty');
  if (utterance.length > MAX_TEXT) return bad(`utterance is longer than ${MAX_TEXT} characters`);

  return { schema_version: TRURL_SCHEMA_VERSION, plane, stretch, moment, landmark, looking_at: lookingAt, earned: [...new Set(r.earned as string[])], dialogue, utterance };
}
