/**
 * Bar height, 0..1, for bar `i` of `n` at time `t` seconds: the idle shape of
 * the Aloud waveform. Pure and free of browser APIs, so the canvas, the tests
 * and the link-preview image all draw the same wave.
 */
export function idleBarAmp(i: number, n: number, t: number): number {
  const u = n > 1 ? (i / (n - 1)) * 2 - 1 : 0; // -1..1 across the row
  const envelope = 0.2 + 0.8 * Math.exp(-u * u * 2.4); // tall in the middle, tapering out
  const wobble = 0.5 + 0.28 * Math.sin(t * 1.35 + i * 0.55) + 0.22 * Math.sin(t * 0.72 + i * 0.23 + 1.7);
  return Math.max(0.04, Math.min(1, envelope * wobble * 1.15));
}
