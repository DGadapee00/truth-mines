import { displayName, type MineGraph } from '../../core/graph';
import type { Meta } from '../../core/schema';
import { subjectCss } from '../render/palette';
import type { Store } from '../state';

/** The search box: find a landmark by name or label and go to it. */
export function createSearch(input: HTMLInputElement, list: HTMLElement, graph: MineGraph, meta: Meta, store: Store) {
  const subjectName = new Map(meta.subjects.map((s) => [s.id, s.name]));
  let results: string[] = [];
  let active = 0;
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);

  function render() {
    list.hidden = !results.length;
    list.innerHTML = results
      .map((id, i) => {
        const n = graph.must(id);
        return `<li role="option" aria-selected="${i === active}" data-id="${esc(id)}" style="--c:${subjectCss(n.subject)}">
          <span class="dot"></span><span class="t">${esc(displayName(n))}</span>
          <span class="m">${esc(n.id)} · ${esc(subjectName.get(n.subject) ?? '')} · depth ${n.depth}</span></li>`;
      })
      .join('');
  }
  function choose(id: string | undefined) {
    if (!id) return;
    store.select(id);
    input.value = '';
    results = [];
    render();
    input.blur();
  }

  input.addEventListener('input', () => {
    results = graph.search(input.value, 10).map((n) => n.id);
    active = 0;
    render();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') active = Math.min(results.length - 1, active + 1);
    else if (e.key === 'ArrowUp') active = Math.max(0, active - 1);
    else if (e.key === 'Enter') return choose(results[active]);
    else if (e.key === 'Escape') {
      results = [];
      input.blur();
    } else return;
    e.preventDefault();
    render();
  });
  list.addEventListener('mousedown', (e) => {
    const li = (e.target as HTMLElement).closest('li');
    if (li?.dataset.id) {
      e.preventDefault();
      choose(li.dataset.id);
    }
  });
  input.addEventListener('blur', () => setTimeout(() => ((results = []), render()), 120));
}
