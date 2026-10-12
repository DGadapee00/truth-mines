import './style.css';
import { intro, type Line } from '../copy';
import type { SyncStatus } from '../lib/progress-store';
import type { TrurlState } from '../lib/trurl-session';

export interface UiHandlers {
  onSaveCredentials(worker: string, secret: string): void;
  onContinueWithout(): void;
  onBegin(): void;
  onEnterVR(): void;
  onSkip(): void;
  onSay(text: string): void;
  onTalkStart(): void;
  onTalkEnd(): void;
  onLeavePlane(): void;
  onStop(id: string): void;
  onResetSieve(): void;
  onForget(): void;
}

const SYNC_TEXT: Record<SyncStatus, string> = {
  local: 'Saved on this device',
  synced: 'Saved and synced',
  syncing: 'Syncing…',
  offline: 'Saved here; will sync when it can',
  unauthorized: 'Sync is off: the secret was not accepted',
};

const el = <T extends HTMLElement>(root: ParentNode, id: string): T => {
  const e = root.querySelector<T>(`#${id}`);
  if (!e) throw new Error(`missing #${id}`);
  return e;
};

/**
 * The desktop interface: the gate (the secret, entered once per device), the begin button, the
 * HUD with its captions and text box, and the plane's readouts. It is plain DOM, so it works with
 * a mouse and keyboard and is easy to test. In a headset the same facts appear in the world instead.
 */
export class Ui {
  private readonly shown = new Map<string, string>();

  constructor(
    private readonly root: HTMLElement,
    private readonly h: UiHandlers,
    opts: { workerUrl: string },
  ) {
    root.insertAdjacentHTML(
      'beforeend',
      `
<section class="card" id="gate" aria-labelledby="gate-title">
  <div>
    <h1 id="gate-title">The Truth Mines</h1>
    <p id="gate-intro"></p>
    <p class="fine">Trurl and progress sync need a secret, entered once on each device. Without it the cathedral still opens; Trurl stays asleep.</p>
    <label for="gate-worker">Worker address</label>
    <input id="gate-worker" type="url" autocomplete="off" spellcheck="false" placeholder="https://trurl.your-name.workers.dev" value="${opts.workerUrl.replace(/"/g, '&quot;')}">
    <label for="gate-secret">App secret</label>
    <input id="gate-secret" type="password" autocomplete="off" spellcheck="false">
    <div class="row">
      <button id="gate-save" class="primary" type="button">Save and continue</button>
      <button id="gate-nosecret" type="button">Continue without Trurl</button>
    </div>
  </div>
</section>
<section class="card" id="ready" aria-labelledby="ready-title" hidden>
  <div>
    <h1 id="ready-title">Ready</h1>
    <p id="ready-text"></p>
    <div class="row">
      <button id="begin" class="primary" type="button">Begin</button>
      <button id="enter-vr" type="button" hidden>Enter VR</button>
      <button id="ready-settings" class="ghost" type="button">Settings</button>
    </div>
  </div>
</section>
<div id="hud" hidden>
  <div id="place"><h2 id="place-name"></h2><p id="place-text"></p></div>
  <div id="top-right"><span id="sync"></span><button id="settings-btn" class="ghost" type="button" aria-haspopup="dialog">Settings</button></div>
  <div id="crosshair"></div>
  <div id="door-label" hidden></div>
  <div id="plane-hud" hidden>
    <div class="box"><strong id="pl-name"></strong><div id="pl-text"></div></div>
    <div class="box" id="pl-sieve" hidden><span id="pl-count"></span> <button id="pl-reset" class="ghost" type="button">Reset</button><div id="pl-note" hidden></div></div>
    <div class="box" id="pl-focus-box" hidden><span id="pl-focus"></span></div>
    <div class="box" id="pl-readout" hidden></div>
    <div id="pl-stops"></div>
    <button id="leave-plane" type="button">Back to the cathedral</button>
  </div>
  <button id="skip" type="button" hidden>Skip</button>
  <div id="toast" hidden role="status"></div>
  <div id="bottom">
    <div id="captions" data-empty="true" data-status="idle" aria-live="polite"></div>
    <form id="talk-bar" autocomplete="off">
      <input id="say-input" type="text" maxlength="600" placeholder="Say something to Trurl…" aria-label="Say something to Trurl">
      <button id="say-send" type="submit">Send</button>
      <button id="talk" type="button" aria-label="Hold to talk (or hold V)">Hold to talk</button>
    </form>
  </div>
</div>
<div id="settings" role="dialog" aria-label="Settings" hidden>
  <label for="set-worker">Worker address</label><input id="set-worker" type="url" autocomplete="off" spellcheck="false">
  <label for="set-secret">App secret</label><input id="set-secret" type="password" autocomplete="off" spellcheck="false" placeholder="unchanged">
  <div class="row"><button id="set-save" type="button">Save</button><button id="set-forget" class="ghost" type="button">Forget this device</button><button id="set-close" class="ghost" type="button">Close</button></div>
</div>`,
    );
    for (const [id, l] of [['gate-intro', intro.gate()], ['ready-text', intro.ready()]] as const) {
      this.text(id, l.text);
      this.q(id).dataset.draft = String(l.draft);
    }
    this.wire();
  }

  private q<T extends HTMLElement>(id: string): T {
    return el<T>(this.root, id);
  }

  private wire(): void {
    const q = <T extends HTMLElement>(id: string) => this.q<T>(id);
    q('gate-save').addEventListener('click', () => this.h.onSaveCredentials(q<HTMLInputElement>('gate-worker').value.trim(), q<HTMLInputElement>('gate-secret').value.trim()));
    q('gate-nosecret').addEventListener('click', () => this.h.onContinueWithout());
    q('begin').addEventListener('click', () => this.h.onBegin());
    q('enter-vr').addEventListener('click', () => this.h.onEnterVR());
    q('skip').addEventListener('click', () => this.h.onSkip());
    q('leave-plane').addEventListener('click', () => this.h.onLeavePlane());
    q('pl-reset').addEventListener('click', () => this.h.onResetSieve());
    q('pl-stops').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (b?.dataset.stop) this.h.onStop(b.dataset.stop);
    });
    q<HTMLFormElement>('talk-bar').addEventListener('submit', (e) => {
      e.preventDefault();
      const input = q<HTMLInputElement>('say-input');
      const text = input.value;
      input.value = '';
      input.blur(); // the keys are the scene's again (W A S D, 1 2 3); T brings the box back
      this.h.onSay(text);
    });
    q<HTMLInputElement>('say-input').addEventListener('keydown', (e) => {
      if (e.key === 'Escape') (e.target as HTMLInputElement).blur();
    });
    const talk = q('talk');
    talk.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.h.onTalkStart();
    });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel'] as const) talk.addEventListener(ev, () => this.h.onTalkEnd());
    const open = () => {
      q<HTMLInputElement>('set-worker').value = q<HTMLInputElement>('gate-worker').value;
      q('settings').hidden = !q('settings').hidden;
    };
    q('settings-btn').addEventListener('click', open);
    q('ready-settings').addEventListener('click', open);
    q('set-close').addEventListener('click', () => (q('settings').hidden = true));
    q('set-save').addEventListener('click', () => {
      this.h.onSaveCredentials(q<HTMLInputElement>('set-worker').value.trim(), q<HTMLInputElement>('set-secret').value.trim());
      q<HTMLInputElement>('set-secret').value = '';
      q('settings').hidden = true;
    });
    q('set-forget').addEventListener('click', () => {
      this.h.onForget();
      q<HTMLInputElement>('set-secret').value = '';
      q('settings').hidden = true;
    });
  }

  /** Keep the settings and gate fields in step with what is stored on this device (the secret is never shown). */
  setWorkerUrl(url: string): void {
    this.q<HTMLInputElement>('gate-worker').value = url;
    this.q<HTMLInputElement>('set-worker').value = url;
  }

  showGate(): void {
    this.q('gate').hidden = false;
    this.q('ready').hidden = true;
    this.q('hud').hidden = true;
  }

  showReady(opts: { vr: boolean; returning: boolean }): void {
    this.q('gate').hidden = true;
    this.q('ready').hidden = false;
    this.q('hud').hidden = true;
    this.q('enter-vr').hidden = !opts.vr;
    this.q('ready-text').textContent = opts.returning
      ? 'Welcome back. Press begin to cross the threshold again; during the crossing you may skip it.'
      : 'Press begin to cross the threshold. You can look around the whole way; nothing turns your view for you.';
  }

  showHud(): void {
    this.q('gate').hidden = true;
    this.q('ready').hidden = true;
    this.q('hud').hidden = false;
  }

  /** Only change the DOM when a value changes: cheap to call every frame. */
  private text(id: string, value: string): void {
    if (this.shown.get(id) === value) return;
    this.shown.set(id, value);
    this.q(id).textContent = value;
  }

  setPlace(name: string, line: Line): void {
    this.text('place-name', name);
    this.text('place-text', line.text);
    this.q('place-text').dataset.draft = String(line.draft);
  }

  setDoorLabel(line: Line | null): void {
    const e = this.q('door-label');
    e.hidden = line === null;
    if (line !== null) {
      this.text('door-label', line.text);
      e.dataset.draft = String(line.draft);
    }
  }

  setSkip(visible: boolean): void {
    this.q('skip').hidden = !visible;
  }

  setSync(status: SyncStatus): void {
    this.text('sync', SYNC_TEXT[status]);
  }

  toast(text: string | null, draft = false): void {
    const e = this.q('toast');
    e.hidden = text === null;
    e.dataset.draft = String(draft);
    if (text !== null) e.textContent = text;
  }

  setCaptions(s: TrurlState): void {
    const e = this.q('captions');
    const text = s.hint && !s.caption ? s.hint : s.caption;
    e.dataset.empty = text || s.status === 'thinking' ? 'false' : 'true';
    e.dataset.status = s.status;
    // A line written ahead of time (a hint, a failure line, the question after the doing) is a draft until a person has reviewed it; a live reply never is
    e.dataset.draft = String(!!text && (s.draft || (!!s.hint && !s.caption)));
    const key = `${text}|${s.status}`;
    if (this.shown.get('captions') === key) return;
    this.shown.set('captions', key);
    e.textContent = '';
    if (text || s.status === 'thinking') {
      const who = document.createElement('span');
      who.className = 'who';
      who.textContent = 'Trurl';
      e.append(who, document.createTextNode(text));
    }
  }

  setTalking(live: boolean): void {
    this.q('talk').dataset.live = String(live);
    this.q('talk').textContent = live ? 'Listening…' : 'Hold to talk';
  }

  setSayInterim(text: string): void {
    this.q<HTMLInputElement>('say-input').value = text;
  }

  // ---- the plane's readouts
  showPlane(on: boolean, stops: { id: string; name: string }[] = []): void {
    this.q('plane-hud').hidden = !on;
    if (on && this.q('pl-stops').childElementCount === 0) {
      stops.forEach((s, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'ghost';
        b.dataset.stop = s.id;
        b.textContent = `${i + 1}  ${s.name}`;
        b.title = `Travel to ${s.name} (${i + 1})`;
        this.q('pl-stops').append(b);
      });
    }
  }

  setPlane(o: { name: string; text: string; draft: boolean; focus: string; sieve: boolean; count: string; note: string | null; noteDraft: boolean; readout: string | null; here: string }): void {
    this.text('pl-name', o.name);
    this.text('pl-text', o.text);
    this.q('pl-text').dataset.draft = String(o.draft && !!o.text);
    this.q('pl-note').dataset.draft = String(o.noteDraft);
    this.q('pl-focus-box').hidden = !o.focus;
    this.text('pl-focus', o.focus);
    this.q('pl-sieve').hidden = !o.sieve;
    this.text('pl-count', o.count);
    this.q('pl-note').hidden = o.note === null;
    if (o.note !== null) this.text('pl-note', o.note);
    this.q('pl-readout').hidden = o.readout === null;
    if (o.readout !== null) this.text('pl-readout', o.readout);
    for (const b of this.q('pl-stops').querySelectorAll('button')) b.classList.toggle('here', b.dataset.stop === o.here);
  }
}
