/**
 * The Worker against the real built data (needs `python -m pipeline`; the copy of grounding.json
 * is made by `npm test`). Every moment and landmark Trurl knows must exist in the pathways and the
 * graph, and nothing unreviewed may reach its prompt.
 */
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { GraphFile, GroundingFile, PathwaysFile } from '../../core/schema';
import { createHandler } from '../src/handler';
import { buildSystem } from '../src/prompt';
import { parseTrurlRequest } from '../src/request';
import { readEvents, stubFetch } from './anthropic-stub';
import { FakeSocket } from './fake-socket';
import { SECRET, makeEnv } from './helpers';
import { request } from './fixtures';

const data = (p: string) => {
  const url = new URL(`../../${p}`, import.meta.url);
  if (!existsSync(url)) throw new Error(`${p} is missing: run \`python -m pipeline\` first`);
  return JSON.parse(readFileSync(url, 'utf8')) as unknown;
};

const grounding = JSON.parse(readFileSync(new URL('../src/grounding.generated.json', import.meta.url), 'utf8')) as GroundingFile;
const pathways = data('data/pathways.json') as PathwaysFile;
const graph = data('data/graph.json') as GraphFile;
const nodes = new Map(graph.nodes.map((n) => [n.id, n]));

describe('grounding.json against pathways.json and graph.json', () => {
  it('has a moment for every moment in the pathways, with the same stretch, plane and earns', () => {
    const want = new Map(pathways.pathways.flatMap((p) => p.stretches.flatMap((s) => s.moments.map((m) => [m.id, { plane: p.plane, stretch: s.id, earns: m.earns, landmarks: s.landmarks }] as const))));
    expect([...Object.keys(grounding.moments)].sort()).toEqual([...want.keys()].sort());
    for (const [id, m] of Object.entries(grounding.moments)) {
      const w = want.get(id)!;
      expect({ plane: m.plane, stretch: m.stretch, earns: m.earns, landmarks: m.landmarks }).toEqual(w);
    }
  });

  it('knows the statement of every landmark it mentions, as the graph has it', () => {
    for (const [id, l] of Object.entries(grounding.landmarks)) {
      const n = nodes.get(id)!;
      expect(n, id).toBeDefined();
      expect(l.source).toBe(n.source);
      expect(l.statement).toBe(n.statement);
      expect(l.comment.length).toBeGreaterThan(0);
    }
  });

  it('carries a display form only if a person has reviewed it, and a note only if the pipeline exported it', () => {
    for (const [id, l] of Object.entries(grounding.landmarks)) {
      const n = nodes.get(id)!;
      if (l.display !== undefined) expect(n.display_reviewed, `${id} display`).toBe(true);
      if (n.display && !n.display_reviewed) expect(l.display, `${id} display`).toBeUndefined();
      if (l.note !== undefined) expect(n.note, `${id} note`).not.toBe('');
      if (!n.note) expect(l.note, `${id} note`).toBeUndefined();
    }
  });

  it('carries the two approved rubrics word for word, flagged as reviewed', () => {
    expect(grounding.moments['nt-1-road']).toMatchObject({
      rubric: 'The visitor says, in their own words, that every whole number above 1 is built from primes in exactly one way, apart from order, for example by pointing at a stack such as 12 = 2 · 2 · 3.',
      rubric_reviewed: true,
    });
    expect(grounding.moments['nt-1-sieve']).toMatchObject({
      rubric:
        'The visitor says, in their own words, that a prime is a whole number greater than 1 whose only divisors are 1 and itself, or recognizes that the numbers left standing are exactly those. Why the sieve stops after 7 (every composite up to 100 has a prime factor of at most 7) is a bonus Trurl may draw out, not a requirement.',
      rubric_reviewed: true,
    });
  });
});

describe('Trurl on the real data', () => {
  it('builds a prompt for every moment, with its landmark’s verified statement and its rubric', () => {
    for (const [id, m] of Object.entries(grounding.moments)) {
      const req = parseTrurlRequest(request({ plane: m.plane, stretch: m.stretch, moment: id, landmark: m.earns[0]! }), grounding);
      const { grounding: text } = buildSystem(req, grounding);
      for (const e of m.earns) expect(text).toContain(grounding.landmarks[e]!.source);
      expect(text).toContain(m.rubric);
    }
  });

  it('answers the first moment end to end through the front door, with a mocked Claude', async () => {
    const m = grounding.moments['nt-1-sieve']!;
    const stub = stubFetch({ chunks: ['Seven, ', 'you say.\n', `<verdict>{"earned":${JSON.stringify(m.earns)}}</verdict>`] });
    const handle = createHandler({ grounding, fetch: stub.fetch, now: () => 0, stt: { accept: () => ({ socket: new FakeSocket(), response: new Response() }), connectUpstream: async () => new FakeSocket() } });
    const res = await handle(new Request('https://worker.test/api/trurl', { method: 'POST', headers: { Authorization: `Bearer ${SECRET}` }, body: JSON.stringify(request({ moment: 'nt-1-sieve' })) }), makeEnv());
    const events = await readEvents(res);
    expect(events.find((e) => e.event === 'verdict')!.data.earned).toEqual(m.earns);
  });
});
