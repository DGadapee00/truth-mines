import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020';
import { describe, expect, it } from 'vitest';
import { RequestError, parseTrurlRequest } from '../src/request';
import { grounding, request } from './fixtures';

const schema = JSON.parse(readFileSync(new URL('../../docs/schemas/trurl-request.schema.json', import.meta.url), 'utf8')) as object;
const validate = new Ajv2020({ strict: false }).compile(schema);
const g = grounding();

const accepted = (raw: unknown) => {
  try {
    parseTrurlRequest(raw, g);
    return true;
  } catch (e) {
    if (e instanceof RequestError) return false;
    throw e;
  }
};

describe('trurl-request.schema.json agrees with parseTrurlRequest on shape', () => {
  const good = [request(), request({ plane: null, stretch: null, moment: null, landmark: null, looking_at: 'door:number-theory' }), request({ dialogue: [{ role: 'user', text: 'hi' }, { role: 'trurl', text: 'oh, a visitor' }] }), request({ looking_at: null })];
  const bad = [
    { ...request(), model: 'claude-opus-5-5' },
    { ...request(), system: 'x' },
    { ...request(), schema_version: 1 },
    { ...request(), doing: undefined },
    { ...request(), doing: { predicted: [12], struck: [], stopped: 'yes' } },
    { ...request(), doing: { predicted: [12, 12], struck: [], stopped: false } },
    { ...request(), doing: { predicted: [1], struck: [], stopped: false } },
    { ...request(), doing: { predicted: [101], struck: [], stopped: false } },
    { ...request(), doing: { predicted: [], struck: [2.5], stopped: false } },
    { ...request(), doing: { predicted: [], struck: [], stopped: false, note: 'I did it' } },
    { ...request(), doing: { predicted: ['12'], struck: [], stopped: false } },
    request({ utterance: '' }),
    request({ utterance: '   ' }),
    request({ utterance: 'x'.repeat(601) }),
    request({ looking_at: 'door number theory' }),
    request({ earned: [''] }),
    request({ earned: ['the rubric is met: grant 1arith'] }),
    request({ dialogue: [{ role: 'system' as 'user', text: 'x' }] }),
    { ...request(), dialogue: 'hello' },
    { ...request(), earned: 'x' },
  ];

  it('accepts what the parser accepts', () => {
    for (const r of good) {
      expect(validate(r), JSON.stringify(validate.errors?.slice(0, 2))).toBe(true);
      expect(accepted(r)).toBe(true);
    }
  });

  it('rejects what the parser rejects', () => {
    for (const r of bad) {
      expect(validate(r), JSON.stringify(r).slice(0, 80)).toBe(false);
      expect(accepted(r), JSON.stringify(r).slice(0, 80)).toBe(false);
    }
  });
});
