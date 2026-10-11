// Fails if a provider key or the app secret appears in the repo or in a client build.
//
//   node scripts/check-no-secrets.mjs                  scan every tracked file
//   node scripts/check-no-secrets.mjs --client dist    also scan a client build directory, where
//                                                      the provider key names and hosts may not
//                                                      appear at all: the client only talks to the Worker
//
// Findings name the rule and the place, never the secret itself.
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const KEY_SHAPES = [
  { rule: 'an Anthropic API key', re: /sk-ant-[A-Za-z0-9_-]{20,}/ },
  { rule: 'an xAI API key', re: /\bxai-[A-Za-z0-9]{20,}/ },
  { rule: 'a literal value assigned to a secret name', re: /\b(TRURL_APP_SECRET|ANTHROPIC_API_KEY|XAI_API_KEY)\b["']?\s*[:=]\s*["'][^"'\s]{12,}["']/ },
];

// In a client build none of these may appear: they would mean the client holds, or talks straight to, a provider.
const CLIENT_FORBIDDEN = [
  { rule: 'a provider key name in the client build', re: /\b(ANTHROPIC_API_KEY|XAI_API_KEY)\b/ },
  { rule: 'a provider host in the client build', re: /api\.anthropic\.com|api\.x\.ai/ },
  { rule: 'the app secret name read by the client build', re: /import\.meta\.env\.\w*(SECRET|API_KEY)\w*|process\.env\.\w*(SECRET|API_KEY)\w*/ },
];

const BINARY = /\.(png|jpe?g|gif|webp|woff2?|ttf|otf|ico|gz|zip|pdf|glb|ktx2|mp3|ogg|wav)$/i;
const SECRET_FILES = /(^|\/)(\.env(\.[\w.-]+)?|\.dev\.vars)$/;

export function scanText(text, file, rules) {
  const found = [];
  text.split('\n').forEach((line, i) => {
    for (const { rule, re } of rules) if (re.test(line)) found.push({ file, line: i + 1, rule });
  });
  return found;
}

export function scanFiles(root, files, rules) {
  const found = [];
  for (const f of files) {
    const rel = relative(root, f);
    if (SECRET_FILES.test(rel) && !rel.endsWith('.example')) found.push({ file: rel, line: 0, rule: 'an environment file that holds secrets must not be committed' });
    if (BINARY.test(f)) continue;
    let text;
    try {
      text = readFileSync(f, 'utf8');
    } catch {
      continue;
    }
    found.push(...scanText(text, rel, rules));
  }
  return found;
}

export function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

export function trackedFiles(root) {
  return execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 })
    .split('\0')
    .filter(Boolean)
    .map((f) => join(root, f));
}

export function check(root, clientDirs = []) {
  const found = scanFiles(root, trackedFiles(root), KEY_SHAPES);
  for (const d of clientDirs) found.push(...scanFiles(root, walk(join(root, d)), [...KEY_SHAPES, ...CLIENT_FORBIDDEN]));
  return found;
}

export { KEY_SHAPES, CLIENT_FORBIDDEN };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const args = process.argv.slice(2);
  const dirs = [];
  for (let i = 0; i < args.length; i++) if (args[i] === '--client' && args[i + 1]) dirs.push(args[++i]);
  const found = check(root, dirs);
  for (const f of found) console.error(`secret scan: ${f.file}${f.line ? `:${f.line}` : ''}: ${f.rule}`);
  if (found.length) process.exit(1);
  console.log(`secret scan: clean (${dirs.length ? `repo and ${dirs.join(', ')}` : 'repo'})`);
}
