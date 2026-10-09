/**
 * Walking one derivation: the student picks each next line from a few candidates.
 *
 * A right pick adds the line to the working and waits for "Next step". A wrong pick shows why it is
 * wrong and stays on the step. The options are shuffled once per step, the same way every time, so
 * the right one is not always first.
 */
export function createRun(derivation) {
  const steps = derivation.steps.map((s, k) => ({ ...s, options: shuffle(s.options, `${derivation.id}#${k}`) }));
  const run = {
    derivation,
    steps,
    k: 0,
    /** Index of the right pick on this step once made, else null. */
    right: null,
    /** Wrong picks on this step, by option index. */
    wrong: new Set(),
    /** The last pick's verdict, for the feedback box: { ok, why } or null. */
    last: null,
    lines: [],
    firstTry: 0,
    get step() {
      return steps[run.k] || null;
    },
    get done() {
      return run.k >= steps.length;
    },
    pick(i) {
      const st = run.step;
      if (!st || run.right != null) return null;
      const o = st.options[i];
      if (!o) return null;
      if (o.ok) {
        if (!run.wrong.size) run.firstTry++;
        run.right = i;
        run.lines.push(st.line);
        run.last = { ok: true };
      } else {
        run.wrong.add(i);
        run.last = { ok: false, why: o.why };
      }
      return run.last;
    },
    next() {
      if (run.right == null) return;
      run.k++;
      run.right = null;
      run.wrong = new Set();
      run.last = null;
    },
  };
  return run;
}

/** A shuffle seeded by a string: the same order for the same step every time. */
export function shuffle(arr, seedText) {
  let h = 2166136261;
  for (const ch of seedText) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const rand = () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
