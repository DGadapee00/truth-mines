export const STT_RATE = 16000;

/**
 * Microphone samples (floats at the AudioContext's rate) as the 16 kHz 16-bit mono PCM the
 * speech-to-text proxy expects. Linear interpolation is enough for speech; each output sample is
 * clipped, not wrapped.
 */
export function floatToPcm16(input: Float32Array, inRate: number, outRate = STT_RATE): Int16Array {
  const n = Math.floor((input.length * outRate) / inRate);
  const out = new Int16Array(n);
  const step = inRate / outRate;
  for (let i = 0; i < n; i++) {
    const x = i * step;
    const a = Math.floor(x);
    const f = x - a;
    const v = (input[a] ?? 0) * (1 - f) + (input[Math.min(a + 1, input.length - 1)] ?? 0) * f;
    out[i] = Math.max(-32768, Math.min(32767, Math.round(v < 0 ? v * 32768 : v * 32767)));
  }
  return out;
}
