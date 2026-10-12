import { describe, expect, it } from 'vitest';
import { floatToPcm16 } from './pcm';

describe('floatToPcm16', () => {
  it('turns silence into zeros of the right length at 16 kHz', () => {
    const out = floatToPcm16(new Float32Array(4800), 48000);
    expect(out.length).toBe(1600);
    expect(out.every((v) => v === 0)).toBe(true);
  });

  it('keeps a 16 kHz signal as it is, scaled to 16 bits', () => {
    const out = floatToPcm16(Float32Array.from([0, 0.5, -0.5, 1, -1]), 16000);
    expect([...out]).toEqual([0, 16384, -16384, 32767, -32768]);
  });

  it('clips what is out of range instead of wrapping', () => {
    const out = floatToPcm16(Float32Array.from([2, -2, 1.0001]), 16000);
    expect([...out]).toEqual([32767, -32768, 32767]);
  });

  it('downsamples a tone and keeps its amplitude and period', () => {
    const inRate = 48000;
    const n = 4800;
    const tone = new Float32Array(n).map((_, i) => 0.8 * Math.sin((2 * Math.PI * 440 * i) / inRate));
    const out = floatToPcm16(tone, inRate);
    expect(out.length).toBe(1600);
    const peak = Math.max(...out.map(Math.abs));
    expect(peak / 32768).toBeGreaterThan(0.75);
    expect(peak / 32768).toBeLessThan(0.82);
    let crossings = 0;
    for (let i = 1; i < out.length; i++) if (out[i - 1]! < 0 && out[i]! >= 0) crossings++;
    expect(crossings).toBeGreaterThanOrEqual(43); // 440 Hz for 0.1 s
    expect(crossings).toBeLessThanOrEqual(45);
  });

  it('copes with an empty buffer and with a rate below 16 kHz', () => {
    expect(floatToPcm16(new Float32Array(0), 48000).length).toBe(0);
    expect(floatToPcm16(new Float32Array(800), 8000).length).toBe(1600);
  });
});
