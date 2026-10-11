import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error: a plain .mjs script with no type declarations
import { CLIENT_FORBIDDEN, KEY_SHAPES, scanFiles, scanText, check } from './check-no-secrets.mjs';

type Finding = { file: string; line: number; rule: string };
// Built at run time so this file itself holds nothing that looks like a key.
const anthropicKey = 'sk-' + 'ant-' + 'a'.repeat(30);
const xaiKey = 'xai' + '-' + 'b'.repeat(30);

function tree(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'secrets-'));
  for (const [name, text] of Object.entries(files)) {
    const p = join(root, name);
    mkdirSync(join(p, '..'), { recursive: true });
    writeFileSync(p, text);
  }
  return root;
}

describe('secret scan', () => {
  it('finds a planted Anthropic key, xAI key and literal secret assignment, by place and not by value', () => {
    const text = [`const a = "${anthropicKey}";`, `const b = '${xaiKey}';`, `TRURL_APP_SECRET = "correct-horse-battery-staple"`, `ANTHROPIC_API_KEY: 'literal-value-12345'`].join('\n');
    const found = scanText(text, 'x.ts', KEY_SHAPES) as Finding[];
    expect(found.map((f) => f.line)).toEqual([1, 2, 3, 4]);
    for (const f of found) expect(JSON.stringify(f)).not.toContain('aaaa');
  });

  it('passes the ways the repo names secrets without holding one', () => {
    const clean = [
      'export const SECRET = "test-app-secret-0123456789abcdef";',
      'ANTHROPIC_API_KEY: FAKE_ANTHROPIC_KEY,',
      'TRURL_APP_SECRET: SECRET,',
      'wrangler secret put TRURL_APP_SECRET',
      'const key = env.ANTHROPIC_API_KEY;',
      'apiKey: env.ANTHROPIC_API_KEY',
    ].join('\n');
    expect(scanText(clean, 'x.ts', KEY_SHAPES)).toEqual([]);
  });

  it('flags a committed .env file but not an example', () => {
    const root = tree({ '.env': 'X=1', 'worker/.dev.vars': 'X=1', '.env.example': 'X=', 'a.txt': 'hello' });
    const found = scanFiles(root, ['.env', 'worker/.dev.vars', '.env.example', 'a.txt'].map((f) => join(root, f)), KEY_SHAPES) as Finding[];
    expect(found.map((f) => f.file).sort()).toEqual(['.env', 'worker/.dev.vars']);
  });

  it('is stricter on a client build: provider names and hosts may not appear at all', () => {
    const rules = [...KEY_SHAPES, ...CLIENT_FORBIDDEN];
    for (const line of ['fetch("https://api.anthropic.com/v1/messages")', 'new WebSocket("wss://api.x.ai/v1/stt")', 'const k = ANTHROPIC_API_KEY', 'x(import.meta.env.VITE_TRURL_APP_SECRET)', 'process.env.XAI_API_KEY']) {
      expect(scanText(line, 'dist/a.js', rules), line).not.toEqual([]);
    }
    expect(scanText('fetch(workerUrl + "/api/trurl", {headers: {Authorization: "Bearer " + localStorage.getItem("secret")}})', 'dist/a.js', rules)).toEqual([]);
  });

  it('this repository is clean', () => {
    const root = new URL('..', import.meta.url).pathname;
    expect(check(root)).toEqual([]);
  });
});
