/**
 * What this student has mined, kept in this browser. Storage can be missing or throw (a private
 * window, a headset browser with site data cleared), so every read and write is guarded and the
 * mine works without it, forgetting on reload.
 */
const KEY = 'truth-mines:v1';

export function loadProgress() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    return new Set(Array.isArray(raw.mined) ? raw.mined : []);
  } catch {
    return new Set();
  }
}

export function saveProgress(mined) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ mined: [...mined] }));
  } catch {
    /* not kept: fine */
  }
}
