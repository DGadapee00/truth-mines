import type { MineGraph } from '../core/graph';

/**
 * What the student is looking at: the selected node and which way its trace runs.
 * The renderer and the panel both redraw from this on every change.
 */
export type TraceMode = 'up' | 'down';

export interface View {
  selected: string | null;
  mode: TraceMode;
  /** Nodes lit by the trace, not including the selected one */
  lit: ReadonlySet<string>;
  /** Tunnels lit by the trace, as [from, to] pairs */
  litTunnels: readonly [string, string][];
  /** Tracing up: the critical path, [selected, …, axiom], drawn brighter than the rest */
  critical: readonly string[];
}

export interface Store {
  readonly view: View;
  select(id: string | null): void;
  setMode(mode: TraceMode): void;
  onChange(fn: (v: View) => void): void;
}

const EMPTY: ReadonlySet<string> = new Set();

export function createStore(graph: MineGraph): Store {
  const listeners: ((v: View) => void)[] = [];
  let view: View = { selected: null, mode: 'up', lit: EMPTY, litTunnels: [], critical: [] };

  function compute(selected: string | null, mode: TraceMode): View {
    if (!selected) return { selected: null, mode, lit: EMPTY, litTunnels: [], critical: [] };
    const lit = mode === 'up' ? graph.ancestors(selected) : graph.descendants(selected);
    const critical = mode === 'up' ? graph.criticalPath(selected) : [];
    return { selected, mode, lit, litTunnels: graph.tunnelsWithin(selected, lit), critical };
  }
  function set(next: View) {
    view = next;
    for (const fn of listeners) fn(view);
  }

  return {
    get view() {
      return view;
    },
    select(id) {
      if (id !== null && !graph.get(id)) return;
      set(compute(id, view.mode));
    },
    setMode(mode) {
      set(compute(view.selected, mode));
    },
    onChange(fn) {
      listeners.push(fn);
    },
  };
}
