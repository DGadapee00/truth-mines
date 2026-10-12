import { existsSync, readFileSync } from 'node:fs';

/** Built data for tests (needs `python -m pipeline`). */
export function readData<T>(name: string): T {
  const url = new URL(`../../../data/${name}`, import.meta.url);
  if (!existsSync(url)) throw new Error(`data/${name} is missing: run \`python -m pipeline\` first`);
  return JSON.parse(readFileSync(url, 'utf8')) as T;
}
