import { describe, expect, it } from 'vitest';
import { corsHeaders } from '../src/cors';
import { makeEnv } from './helpers';

const env = makeEnv();
const withOrigin = (origin?: string) => new Request('https://worker.test/api/progress', { headers: origin ? { Origin: origin } : {} });

describe('corsHeaders', () => {
  it('allows the production origin and echoes it', () => {
    const h = corsHeaders(withOrigin('https://truth-mines.example'), env)!;
    expect(h.get('Access-Control-Allow-Origin')).toBe('https://truth-mines.example');
    expect(h.get('Access-Control-Allow-Headers')).toContain('Authorization');
    expect(h.get('Vary')).toBe('Origin');
  });

  it('allows several listed origins and ignores a trailing slash in the list', () => {
    const many = makeEnv({ ALLOWED_ORIGINS: 'https://a.example/, https://b.example' });
    expect(corsHeaders(withOrigin('https://a.example'), many)).not.toBeNull();
    expect(corsHeaders(withOrigin('https://b.example'), many)).not.toBeNull();
  });

  it('allows localhost and local-network dev origins, http and https', () => {
    for (const o of ['http://localhost:5173', 'https://localhost:8081', 'http://127.0.0.1:3000', 'https://192.168.1.20:8081', 'https://10.0.0.7:8081', 'https://172.20.1.2:8081']) {
      expect(corsHeaders(withOrigin(o), env), o).not.toBeNull();
    }
  });

  it('refuses an unlisted origin, with nothing to echo', () => {
    for (const o of ['https://evil.example', 'https://truth-mines.example.evil.example', 'http://truth-mines.example', 'https://localhost.evil.example', 'https://8.8.8.8', 'https://172.32.0.1', 'null']) {
      expect(corsHeaders(withOrigin(o), env), o).toBeNull();
    }
  });

  it('refuses everything but the local origins when ALLOWED_ORIGINS is unset', () => {
    const bare = makeEnv({ ALLOWED_ORIGINS: undefined });
    expect(corsHeaders(withOrigin('https://truth-mines.example'), bare)).toBeNull();
    expect(corsHeaders(withOrigin('http://localhost:5173'), bare)).not.toBeNull();
  });

  it('gives a request with no Origin no CORS headers', () => {
    const h = corsHeaders(withOrigin(), env)!;
    expect(h.get('Access-Control-Allow-Origin')).toBeNull();
  });
});
