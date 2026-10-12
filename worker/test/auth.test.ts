import { describe, expect, it } from 'vitest';
import { authorize, presentedSecret } from '../src/auth';
import { SECRET, makeEnv } from './helpers';

const r = (headers: Record<string, string>) => new Request('https://worker.test/x', { headers });
const env = makeEnv();

describe('authorize', () => {
  it('accepts the right bearer secret', async () => {
    expect(await authorize(r({ Authorization: `Bearer ${SECRET}` }), env)).toBe(true);
  });

  it('refuses a missing, malformed or wrong secret', async () => {
    for (const headers of [{} as Record<string, string>, { Authorization: SECRET }, { Authorization: 'Bearer' }, { Authorization: 'Bearer ' }, { Authorization: 'Basic abc' }, { Authorization: 'Bearer wrong' }]) {
      expect(await authorize(r(headers), env), JSON.stringify(headers)).toBe(false);
    }
  });

  it('compares the whole secret: a difference at the first or the last character both fail, and so does a prefix or an extension', async () => {
    const flip = (i: number) => SECRET.slice(0, i) + (SECRET[i] === 'x' ? 'y' : 'x') + SECRET.slice(i + 1);
    for (const bad of [flip(0), flip(SECRET.length - 1), SECRET.slice(0, -1), SECRET + 'x', SECRET.toUpperCase()]) {
      expect(await authorize(r({ Authorization: `Bearer ${bad}` }), env), bad).toBe(false);
    }
  });

  it('looks at every byte of the comparison: a wrong secret whose hash agrees with the right one in the last byte only still fails', async () => {
    const hash = async (x: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(x)));
    const want = await hash(SECRET);
    let twin: string | null = null;
    for (let i = 0; i < 100_000 && twin === null; i++) {
      const h = await hash(`candidate-${i}`);
      if (h[31] === want[31]) twin = `candidate-${i}`;
    }
    expect(twin).not.toBeNull();
    expect(await authorize(r({ Authorization: `Bearer ${twin}` }), env)).toBe(false);
  });

  it('refuses everything when the Worker has no secret configured', async () => {
    for (const secret of ['', undefined as unknown as string]) {
      const bare = makeEnv({ TRURL_APP_SECRET: secret });
      expect(await authorize(r({ Authorization: 'Bearer ' }), bare)).toBe(false);
      expect(await authorize(r({ Authorization: 'Bearer undefined' }), bare)).toBe(false);
      expect(await authorize(r({ Authorization: `Bearer ${SECRET}` }), bare)).toBe(false);
    }
  });

  it('accepts the secret in a WebSocket subprotocol, which a browser can set, and ignores other protocols', async () => {
    expect(await authorize(r({ 'Sec-WebSocket-Protocol': `trurl.v1, bearer.${SECRET}` }), env)).toBe(true);
    expect(await authorize(r({ 'Sec-WebSocket-Protocol': `bearer.${SECRET}` }), env)).toBe(true);
    expect(await authorize(r({ 'Sec-WebSocket-Protocol': 'trurl.v1, bearer.nope' }), env)).toBe(false);
    expect(await authorize(r({ 'Sec-WebSocket-Protocol': 'trurl.v1' }), env)).toBe(false);
  });

  it('does not read the secret from the URL', async () => {
    expect(await authorize(new Request(`https://worker.test/x?secret=${SECRET}&token=${SECRET}`), env)).toBe(false);
    expect(presentedSecret(new Request(`https://worker.test/x?secret=${SECRET}`))).toBeNull();
  });
});
