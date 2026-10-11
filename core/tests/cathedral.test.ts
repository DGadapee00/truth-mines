/**
 * cathedral.json and pathways.json as built, and the parsers that guard them. The data checks need
 * `python -m pipeline` to have run (CI runs it first); the parser checks use the built files as a
 * starting point and break one thing at a time.
 */
import { existsSync, readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020';
import { describe, expect, it } from 'vitest';
import { parseCathedral, parseGraph, parsePathways, PLANE_IDS, SchemaError, type CathedralFile, type PathwaysFile } from '../schema';

const root = new URL('../../', import.meta.url);
const read = (p: string) => {
  const url = new URL(p, root);
  if (!existsSync(url)) throw new Error(`${p} is missing: run \`npm run data\` (python -m pipeline) first`);
  return JSON.parse(readFileSync(url, 'utf8')) as unknown;
};
const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

describe('built cathedral and pathways', () => {
  const rawCathedral = read('data/cathedral.json');
  const rawPathways = read('data/pathways.json');
  const graph = parseGraph(read('data/graph.json'));
  const ids = new Set(graph.nodes.map((n) => n.id));
  const cathedral = parseCathedral(rawCathedral);
  const pathways = parsePathways(rawPathways);

  it('has twelve doors, one per plane, and a pathway behind each', () => {
    expect(cathedral.doors.map((d) => d.plane).sort()).toEqual([...PLANE_IDS].sort());
    expect(pathways.pathways.map((p) => p.plane).sort()).toEqual([...PLANE_IDS].sort());
  });

  it('names only landmarks that exist in graph.json', () => {
    const missing: string[] = [];
    for (const p of pathways.pathways) {
      for (const id of p.entry_requires) if (!ids.has(id)) missing.push(`${p.plane} requires ${id}`);
      for (const s of p.stretches) {
        for (const id of s.landmarks) if (!ids.has(id)) missing.push(`${s.id} landmark ${id}`);
        for (const m of s.moments) for (const id of m.earns) if (!ids.has(id)) missing.push(`${m.id} earns ${id}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('matches the JSON Schema files in docs/schemas', () => {
    for (const [file, data] of [
      ['cathedral', rawCathedral],
      ['pathways', rawPathways],
    ] as const) {
      const ajv = new Ajv2020({ strict: false });
      const validate = ajv.compile(read(`docs/schemas/${file}.schema.json`) as object);
      expect(validate(data), JSON.stringify(validate.errors?.slice(0, 2))).toBe(true);
    }
  });

  it('keeps the schema files and the parsers in step on what they reject', () => {
    const ajv = new Ajv2020({ strict: false });
    const validate = ajv.compile(read('docs/schemas/cathedral.schema.json') as object);
    const bad = copy(cathedral);
    bad.doors.pop();
    expect(validate(bad)).toBe(false);
    expect(() => parseCathedral(bad)).toThrow(SchemaError);
  });

  it('has the number theory stretch pointing at a plane file that exists', () => {
    const nt = pathways.pathways.find((p) => p.plane === 'number-theory');
    expect(nt?.stretches.length).toBeGreaterThan(0);
    for (const s of nt?.stretches ?? []) expect(existsSync(new URL(`data/${s.plane_data}`, root))).toBe(true);
  });
});

describe('parseCathedral', () => {
  const good = read('data/cathedral.json') as CathedralFile;

  it('rejects a wrong schema version', () => {
    expect(() => parseCathedral({ ...copy(good), schema_version: 99 })).toThrow(/schema version 99/);
  });

  it('rejects eleven doors, a repeated plane and a repeated slot', () => {
    const eleven = copy(good);
    eleven.doors.pop();
    expect(() => parseCathedral(eleven)).toThrow(/twelve doors/);
    const dup = copy(good);
    dup.doors[1]!.plane = dup.doors[0]!.plane;
    expect(() => parseCathedral(dup)).toThrow(/plane/);
    const slot = copy(good);
    slot.doors[1]!.slot = slot.doors[0]!.slot;
    expect(() => parseCathedral(slot)).toThrow(/slot/);
  });

  it('rejects threshold segments with a gap or the wrong order', () => {
    const gap = copy(good);
    gap.threshold.segments[1]!.s_from += 1;
    expect(() => parseCathedral(gap)).toThrow(/gap/);
    const order = copy(good);
    order.threshold.segments.reverse();
    expect(() => parseCathedral(order)).toThrow(/segments/);
  });

  it('ends the threshold straight down onto the dais, slowly', () => {
    const [drift, descent] = good.threshold.segments;
    expect(descent!.speed).toBeLessThan(drift!.speed);
    const end = good.threshold.path.at(-1)!;
    expect(end).toEqual(good.arrival.pos);
  });

  it('rejects a door whose preview is unknown or whose position is not finite', () => {
    const p = copy(good);
    (p.doors[0]!.preview as { id: string }).id = 'teapot';
    expect(() => parseCathedral(p)).toThrow(/preview/);
    const q = copy(good);
    q.doors[0]!.pos = [0, Number.NaN, 0];
    expect(() => parseCathedral(q)).toThrow(/pos/);
  });
});

describe('parsePathways', () => {
  const good = read('data/pathways.json') as PathwaysFile;

  it('rejects a wrong schema version and a missing pathway', () => {
    expect(() => parsePathways({ ...copy(good), schema_version: 2 })).toThrow(/schema version 2/);
    const eleven = copy(good);
    eleven.pathways.pop();
    expect(() => parsePathways(eleven)).toThrow(/twelve/);
  });

  it('rejects a moment that earns a landmark outside its stretch', () => {
    const bad = copy(good);
    const nt = bad.pathways.find((p) => p.plane === 'number-theory')!;
    nt.stretches[0]!.moments[0]!.earns = ['infpn'];
    expect(() => parsePathways(bad)).toThrow(/outside its stretch/);
  });

  it('rejects a repeated stretch or moment id', () => {
    const bad = copy(good);
    const nt = bad.pathways.find((p) => p.plane === 'number-theory')!;
    nt.stretches[0]!.moments[1]!.id = nt.stretches[0]!.moments[0]!.id;
    expect(() => parsePathways(bad)).toThrow(/moment/);
  });
});
