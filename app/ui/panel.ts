import { displayName, type MineGraph } from '../../core/graph';
import { nameHTML } from './name';
import type { Meta, MineNode } from '../../core/schema';
import { subjectCss } from '../render/palette';
import { texToSvg } from '../render/tex';
import type { Store } from '../state';

/**
 * The side panel: what the selected node says, where it sits, and the tunnels out of it.
 *
 * Everything that moves the view starts from a click here or in the mine: following a tunnel
 * selects the node at its other end, and the camera travels there because the student asked.
 */
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
const KIND: Record<MineNode['kind'], string> = { axiom: 'Axiom', definition: 'Definition', theorem: 'Theorem' };
const fmt = (n: number) => n.toLocaleString('en-US');

export function createPanel(el: HTMLElement, graph: MineGraph, meta: Meta, store: Store, loadNote: (path: string) => Promise<string>) {
  const subjectName = new Map(meta.subjects.map((s) => [s.id, s.name]));
  /** Readable (the display form) or formal (set.mm's statement); kept as the student moves on. */
  let formal = false;

  const link = (id: string, extra = '') => {
    const n = graph.must(id);
    return `<button type="button" class="node-link ${n.kind}" data-go="${esc(id)}" style="--c:${subjectCss(n.subject)}"><span class="dot"></span><span class="t">${nameHTML(displayName(n))}</span>${extra}</button>`;
  };

  function render() {
    const { selected, mode, lit } = store.view;
    el.hidden = !selected;
    if (!selected) return;
    const n = graph.must(selected);
    const up = graph.ancestors(n.id);
    const axioms = [...up].filter((x) => graph.must(x).kind === 'axiom').length;
    const down = graph.descendants(n.id).size;
    const route = graph.pathToAxiom(n.id);
    const deps = n.deps
      .map((d, i) => ({ d, h: n.hidden_steps[i] ?? 0 }))
      .sort((a, b) => graph.must(b.d).depth - graph.must(a.d).depth)
      .map(({ d, h }) => link(d, `<span class="hid" title="Lemmas hidden in this tunnel">${h ? `${fmt(h)} hidden` : 'direct'}</span>`))
      .join('');
    const users = [...graph.dependentsOf(n.id)]
      .sort((a, b) => graph.must(a).depth - graph.must(b).depth)
      .map((d) => link(d))
      .join('');
    const readable = formal ? null : n.display || null;
    const shown = texToSvg(readable ?? n.statement, true);
    const nextUp = route[1];

    el.innerHTML = `
      <button type="button" class="close" data-act="close" aria-label="Close">×</button>
      <div class="kicker"><span class="kind ${n.kind}">${KIND[n.kind]}</span>
        <span class="subject" style="--c:${subjectCss(n.subject)}">${esc(subjectName.get(n.subject) ?? n.subject)}</span></div>
      <h2>${nameHTML(displayName(n))}</h2>
      <p class="label"><a href="https://us.metamath.org/mpeuni/${encodeURIComponent(n.id)}.html" target="_blank" rel="noopener">${esc(n.id)}</a> in Metamath’s set.mm</p>
      <div class="form" role="group" aria-label="Statement form">
        <button type="button" data-form="readable" aria-pressed="${!formal}">${n.display ? 'Readable' : 'Statement'}</button>
        <button type="button" data-form="formal" aria-pressed="${formal}">Formal (set.mm)</button>
      </div>
      <div class="statement" ${shown.error ? 'data-error' : ''}>${shown.error ? `<code>${esc(readable ?? n.statement)}</code>` : shown.svg}</div>
      ${!formal && n.display && !n.display_reviewed ? '<p class="draft">Readable form drafted from set.mm’s statement; not yet reviewed. The formal form is authoritative.</p>' : ''}
      ${formal ? `<p class="source"><span>As set.mm writes it</span><code>${esc(n.source)}</code></p>` : ''}
      <p class="where">Depth <b>${n.depth}</b>${n.depth ? `: its longest chain of proofs back to the surface is ${n.depth} steps.` : ': it stands on the surface, asserted rather than proved.'}</p>
      <div class="counts">
        <div><b>${fmt(up.size)}</b><span>landmarks it rests on${axioms ? `, ${axioms} of them axioms` : ''}</span></div>
        <div><b>${fmt(down)}</b><span>landmarks that rest on it</span></div>
      </div>
      <div class="trace" role="group" aria-label="Trace">
        <button type="button" data-mode="up" aria-pressed="${mode === 'up'}">Trace up to the axioms</button>
        <button type="button" data-mode="down" aria-pressed="${mode === 'down'}">Trace down</button>
      </div>
      <p class="lit">${mode === 'up' ? `Lit: everything it rests on (${fmt(lit.size)}).` : `Lit: everything that rests on it (${fmt(lit.size)}).`}</p>
      ${nextUp ? `<button type="button" class="step" data-go="${esc(nextUp)}">Step up toward the axioms ↑</button>` : ''}
      <div class="note" hidden></div>
      ${n.deps.length ? `<h3>Tunnels up <small>what it depends on directly</small></h3><div class="links">${deps}</div>` : ''}
      ${users ? `<h3>Tunnels down <small>what depends on it directly</small></h3><div class="links">${users}</div>` : ''}
      ${route.length > 2 ? `<h3>Shortest route to an axiom <small>${route.length - 1} tunnels</small></h3><ol class="route">${route.map((r) => `<li>${link(r)}</li>`).join('')}</ol>` : ''}
    `;
    fitStatement(el.querySelector('.statement'));
    if (n.note) {
      const box = el.querySelector('.note') as HTMLElement;
      loadNote(n.note).then(
        (text) => {
          if (store.view.selected !== n.id) return;
          box.hidden = false;
          box.textContent = text.replace(/^---[\s\S]*?---\s*/, '');
        },
        () => {},
      );
    }
  }

  el.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button');
    if (!b) return;
    if (b.dataset.form) {
      formal = b.dataset.form === 'formal';
      render();
    } else if (b.dataset.go) store.select(b.dataset.go);
    else if (b.dataset.mode) store.setMode(b.dataset.mode as 'up' | 'down');
    else if (b.dataset.act === 'close') store.select(null);
  });

  store.onChange(render);
  render();
}

/** A statement wider than its box is scaled down to fit: no sideways scrolling. */
export function fitStatement(box: HTMLElement | null) {
  const svg = box?.querySelector('svg');
  if (!box || !svg) return;
  svg.style.width = '';
  svg.style.height = '';
  const room = box.clientWidth - 24;
  if (svg.getBoundingClientRect().width > room) {
    svg.style.width = '100%';
    svg.style.height = 'auto';
  }
}
