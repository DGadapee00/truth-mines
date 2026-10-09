import { statusOf } from './mine/graph.js';
import { createRun } from './mine/run.js';
import { loadProgress, saveProgress } from './mine/progress.js';

/**
 * What the student is doing, shared by the page's card and the headset's panel: which crystal is
 * selected, which derivation is being walked, what has been mined. Both views redraw on change().
 */
export function createApp(graph) {
  const listeners = new Set();
  const app = {
    graph,
    mined: loadProgress(),
    selected: null,
    run: null,
    /** Set when a derivation is finished: { id, firstTry, steps } for the "Mined!" screen. */
    finished: null,
    onChange(fn) {
      listeners.add(fn);
    },
    changed() {
      for (const fn of listeners) fn(app);
    },
    status: (id) => statusOf(graph.get(id), app.mined),
    select(id) {
      if (app.selected === id && !app.run) return;
      app.selected = id;
      app.run = null;
      app.finished = null;
      app.changed();
    },
    startRun() {
      const node = graph.get(app.selected);
      if (!node?.derivation) return;
      const st = app.status(node.id);
      if (st === 'locked') return;
      app.run = createRun(node.derivation);
      app.finished = null;
      app.changed();
    },
    pick(i) {
      if (!app.run) return;
      app.run.pick(i);
      app.changed();
    },
    next() {
      const run = app.run;
      if (!run || run.right == null) return;
      run.next();
      if (run.done) {
        const id = app.selected;
        app.mined.add(id);
        saveProgress(app.mined);
        app.finished = { id, firstTry: run.firstTry, steps: run.steps.length };
        app.run = null;
      }
      app.changed();
    },
    leaveRun() {
      app.run = null;
      app.finished = null;
      app.changed();
    },
    reset() {
      app.mined = new Set();
      saveProgress(app.mined);
      app.run = null;
      app.finished = null;
      app.changed();
    },
  };
  return app;
}
