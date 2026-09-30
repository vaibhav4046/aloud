"use client";

/**
 * Tiny synthesised cues (no audio files). Off unless the player turned sound
 * on, and the AudioContext is only made after that gesture, so autoplay rules
 * are respected. A cue is a short two-note figure; nothing loops.
 */

export type Cue = "good" | "soft" | "bad" | "proof" | "star" | "crate";

const NOTES: Record<Cue, { f: number; t: number; d: number; type: OscillatorType }[]> = {
  good: [{ f: 523.25, t: 0, d: 0.12, type: "sine" }, { f: 783.99, t: 0.09, d: 0.18, type: "sine" }],
  soft: [{ f: 440, t: 0, d: 0.16, type: "sine" }],
  bad: [{ f: 220, t: 0, d: 0.22, type: "triangle" }, { f: 174.61, t: 0.12, d: 0.26, type: "triangle" }],
  proof: [{ f: 659.25, t: 0, d: 0.1, type: "sine" }, { f: 830.61, t: 0.08, d: 0.1, type: "sine" }, { f: 987.77, t: 0.16, d: 0.22, type: "sine" }],
  star: [{ f: 587.33, t: 0, d: 0.14, type: "sine" }, { f: 880, t: 0.1, d: 0.24, type: "sine" }],
  crate: [{ f: 392, t: 0, d: 0.1, type: "square" }, { f: 587.33, t: 0.09, d: 0.1, type: "square" }, { f: 783.99, t: 0.18, d: 0.26, type: "square" }],
};

let ctx: AudioContext | null = null;

export function playCue(cue: Cue, enabled: boolean): void {
  if (!enabled || typeof window === "undefined") return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    const now = ctx.currentTime;
    for (const n of NOTES[cue]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = n.type;
      osc.frequency.value = n.f;
      gain.gain.setValueAtTime(0.0001, now + n.t);
      gain.gain.exponentialRampToValueAtTime(cue === "crate" ? 0.05 : 0.09, now + n.t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + n.t + n.d);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + n.t);
      osc.stop(now + n.t + n.d + 0.03);
    }
  } catch {
    /* no audio device: the animation is the feedback */
  }
}
