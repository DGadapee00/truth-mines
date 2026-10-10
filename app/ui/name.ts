import katex from 'katex';

/**
 * A landmark name as HTML: prose escaped, $…$ parts typeset by KaTeX. Used in every list on the
 * page (panel, tunnels, routes, search). The 3D labels use the plain-text `label` instead.
 */
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);

const cache = new Map<string, string>();

export function nameHTML(name: string): string {
  const hit = cache.get(name);
  if (hit !== undefined) return hit;
  const html = name
    .split('$')
    .map((part, i) => (i % 2 ? katex.renderToString(part, { throwOnError: false, output: 'html', strict: false }) : esc(part)))
    .join('');
  cache.set(name, html);
  return html;
}

/** KaTeX's verdict on a name's math, for tests: null when every $…$ part parses. */
export function nameError(name: string): string | null {
  const parts = name.split('$');
  if (parts.length % 2 === 0) return 'unbalanced $';
  for (let i = 1; i < parts.length; i += 2) {
    try {
      katex.renderToString(parts[i] as string, { throwOnError: true, strict: false });
    } catch (e) {
      return (e as Error).message;
    }
  }
  return null;
}
