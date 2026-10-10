import { Color } from 'three';

/**
 * Colours. Each subject keeps one hue all the way down the mine; a trace overrides it with gold.
 * Picked to stay distinct from one another and from the trace gold on a near-black background.
 */
export const BG = 0x06080b;
export const TRACE = new Color(0xffcf5a);
export const SELECTED = new Color(0xffffff);

const SUBJECT: Record<string, number> = {
  logic: 0x7aa2ff,
  sets: 0x5fd4c4,
  numbers: 0x9be36f,
  numtheory: 0xf28dbb,
  structures: 0xc39bff,
  algebra: 0xff9a62,
  topology: 0x6fd1ff,
  analysis: 0xe6d36a,
  surreals: 0xd98cff,
  geometry: 0x8ee0a8,
  graphs: 0xff7f8a,
  other: 0x9aa5b1,
};

export function subjectColor(id: string): Color {
  return new Color(SUBJECT[id] ?? SUBJECT.other);
}

export function subjectCss(id: string): string {
  return `#${subjectColor(id).getHexString()}`;
}
