const OPEN = '<verdict>';
const CLOSE = '</verdict>';
const TAGS = /<\/?verdict>/g;

/** Length of the longest suffix of `s` that is a proper prefix of `<verdict>`: text that may still become the tag. */
function partialTag(s: string): number {
  for (let n = Math.min(OPEN.length - 1, s.length); n > 0; n--) if (OPEN.startsWith(s.slice(s.length - n))) return n;
  return 0;
}

/** The ids in `<verdict>{"earned":[...]}</verdict>`, or null if what follows the tag is not exactly that. */
function parseVerdict(zone: string): string[] | null {
  if (!zone.startsWith(OPEN)) return null;
  const close = zone.indexOf(CLOSE);
  if (close === -1 || zone.slice(close + CLOSE.length).trim() !== '') return null;
  try {
    const v = JSON.parse(zone.slice(OPEN.length, close)) as { earned?: unknown };
    return Array.isArray(v.earned) && v.earned.every((x) => typeof x === 'string') ? (v.earned as string[]) : null;
  } catch {
    return null;
  }
}

/**
 * Splits Claude's streamed reply into the words the visitor sees and the machine-read verdict at
 * its end. `push` returns the text that is safe to show now: it holds back a fragment that could
 * still become the opening tag, and everything from a complete opening tag on, until `end` shows
 * whether that really was the closing verdict. Nothing between the tags is ever returned, and the
 * tag text is never shown, even when the model uses it mid-sentence.
 */
export class VerdictSplitter {
  private held = '';
  private inZone = false;

  push(chunk: string): string {
    this.held += chunk;
    if (this.inZone) return '';
    const open = this.held.indexOf(OPEN);
    if (open !== -1) {
      const out = this.held.slice(0, open);
      this.held = this.held.slice(open);
      this.inZone = true;
      return out;
    }
    const keep = partialTag(this.held);
    const out = this.held.slice(0, this.held.length - keep);
    this.held = this.held.slice(this.held.length - keep);
    return out;
  }

  /** The reply is over: the last text to show, and the verdict if the reply ended with one. */
  end(): { text: string; earned: string[] | null } {
    if (!this.inZone) {
      const text = this.held;
      this.held = '';
      return { text, earned: null };
    }
    const last = this.held.lastIndexOf(OPEN);
    const earned = parseVerdict(this.held.slice(last));
    const text = this.held.slice(0, last).replace(TAGS, '');
    this.held = '';
    this.inZone = false;
    return { text, earned };
  }
}
