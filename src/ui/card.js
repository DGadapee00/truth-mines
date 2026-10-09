import { texHTML, proseHTML, optionHTML, esc } from './rich.js';

/**
 * The page's card: the selected crystal, and the derivation while it is being walked.
 * Redrawn from the app state on every change; clicks go back to the app.
 */
export function createCard(el, app) {
  const g = app.graph;
  const chip = (id) => {
    const n = g.get(id);
    return `<button type="button" class="chip ${app.status(id)}" data-go="${id}">${esc(n.title)}</button>`;
  };
  const eyebrow = (n) => `${g.veins[n.vein].name} · ${n.law ? 'Surface' : `Level ${n.depth}`}`;

  function cardView(n) {
    const st = app.status(n.id);
    const status = {
      law: 'A law of the course: given, not derived. Digging starts here.',
      mined: 'Mined. You have derived this.',
      open: 'Ready to mine. Everything it needs is already mined.',
      locked: 'Locked. Mine what it comes from first.',
    }[st];
    const from = n.from.length ? `<div class="links"><span>Comes from</span>${n.from.map(chip).join('')}</div>` : '';
    const to = n.to.length ? `<div class="links"><span>Leads to</span>${n.to.map(chip).join('')}</div>` : '';
    const action =
      st === 'open'
        ? `<button type="button" class="primary" data-act="mine">Mine it</button>`
        : st === 'mined'
          ? `<button type="button" class="ghost" data-act="mine">Walk it again</button>`
          : '';
    return `
      <div class="eyebrow">${eyebrow(n)}</div>
      <h2>${esc(n.title)}</h2>
      <div class="result">${texHTML(n.result, true)}</div>
      ${n.about ? `<p>${proseHTML(n.about)}</p>` : n.derivation ? `<p class="goal">${proseHTML(n.derivation.goal)}</p>` : ''}
      <p class="status ${st}">${status}</p>
      ${from}${to}
      ${action}`;
  }

  function runView(n, run) {
    const st = run.step;
    const opts = st.options
      .map((o, i) => {
        const cls = run.right === i ? 'right' : run.wrong.has(i) ? 'wrong' : '';
        const dis = run.right != null || run.wrong.has(i) ? 'disabled' : '';
        return `<button type="button" class="option ${cls}" data-pick="${i}" ${dis}>${optionHTML(o)}</button>`;
      })
      .join('');
    let fb = '';
    if (run.last?.ok) {
      fb = `<div class="fb ok"><b>✓ Correct.</b>${st.after ? ` ${proseHTML(st.after)}` : ''}
        <button type="button" class="primary" data-act="next">${run.k + 1 === run.steps.length ? 'Finish' : 'Next step →'}</button></div>`;
    } else if (run.last) {
      fb = `<div class="fb bad"><b>✗ Not quite.</b> ${proseHTML(run.last.why)}</div>`;
    }
    return `
      <div class="eyebrow">Mining · Step ${run.k + 1} of ${run.steps.length}</div>
      <h2>${esc(n.title)}</h2>
      <p class="goal">${proseHTML(n.derivation.goal)}</p>
      ${run.lines.length ? `<ol class="working">${run.lines.map((l) => `<li>${texHTML(l, true)}</li>`).join('')}</ol>` : ''}
      <p class="ask">${proseHTML(st.ask)}</p>
      <div class="options">${opts}</div>
      ${fb}
      <button type="button" class="ghost small" data-act="leave">Stop and go back</button>`;
  }

  function doneView(n, f) {
    const tally = f.firstTry === f.steps ? `Every step right first time.` : `${f.firstTry} of ${f.steps} steps right first time.`;
    const opened = n.to.filter((id) => app.status(id) === 'open');
    return `
      <div class="eyebrow">Mined</div>
      <h2>${esc(n.title)}</h2>
      <div class="result mined">${texHTML(n.result, true)}</div>
      <p class="status mined">✓ Mined. ${tally}</p>
      <p>${proseHTML(n.derivation.done)}</p>
      ${opened.length ? `<div class="links"><span>Now open</span>${opened.map(chip).join('')}</div>` : ''}
      <button type="button" class="ghost" data-act="leave">Back to the crystal</button>`;
  }

  function render() {
    const n = app.selected && g.get(app.selected);
    el.hidden = !n;
    if (!n) return;
    const body = app.run ? runView(n, app.run) : app.finished?.id === n.id ? doneView(n, app.finished) : cardView(n);
    el.innerHTML = `<button type="button" class="x" data-act="close" aria-label="Close">×</button><div class="card-body">${body}</div>`;
    // Keep the newest part of a long derivation in view.
    if (app.run) el.querySelector('.fb, .options')?.scrollIntoView({ block: 'nearest' });
  }

  el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    if (b.dataset.go) app.select(b.dataset.go);
    else if (b.dataset.pick != null) app.pick(Number(b.dataset.pick));
    else if (b.dataset.act === 'mine') app.startRun();
    else if (b.dataset.act === 'next') app.next();
    else if (b.dataset.act === 'leave') app.leaveRun();
    else if (b.dataset.act === 'close') app.select(null);
  });

  app.onChange(render);
  render();
}
