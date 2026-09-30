/** Small deterministic helpers. No Math.random and no clock: a run must rebuild identically. */

/** 32 bit FNV-1a. */
export function fnv1a(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A short stable id fragment for any string. */
export function shortHash(text: string): string {
  return fnv1a(text).toString(36).padStart(6, "0");
}

/** Seeded generator in [0, 1). mulberry32. */
export function seeded(seed: string | number): () => number {
  let a = typeof seed === "number" ? seed >>> 0 : fnv1a(seed);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pick one element with a seeded generator. */
export function pick<T>(items: readonly T[], rng: () => number): T {
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))];
}

/** Fisher-Yates on a copy with a seeded generator. */
export function shuffled<T>(items: readonly T[], rng: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
