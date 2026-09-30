import type { ProofCard } from "@/lib/game/types";

/**
 * Pure model for the result screen: the crate roll (the variable reward), the
 * XP count-up curve and the star burst geometry. The roll is a function of a
 * seed string, so the same finished level always opens the same crate and the
 * tests can pin every branch.
 */

export type Crate =
  | { kind: "fact"; quote: string; page: number | null; conceptId: string }
  | { kind: "freeze" }
  | { kind: "xp"; amount: number };

export type CrateInput = {
  seed: string;
  stars: 0 | 1 | 2 | 3;
  won: boolean;
  freezes: number;
  /** Verified quotes the player owns. A fact crate hands one back. */
  facts: Pick<ProofCard, "quote" | "page" | "conceptId">[];
};

export const MAX_FREEZES = 2;
export const XP_CRATE = 50;
const BASE_CHANCE = 0.4;
const STAR_CHANCE_BONUS = 0.2;

/** mulberry32 over an FNV-1a hash of the seed. Small, seedable, no dependency. */
export function seededRandom(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Returns the crate a finished level opens, or null. About two levels in five, more on three stars. */
export function rollCrate(input: CrateInput): Crate | null {
  if (!input.won) return null;
  const rnd = seededRandom(input.seed);
  const chance = BASE_CHANCE + (input.stars === 3 ? STAR_CHANCE_BONUS : 0);
  if (rnd() >= chance) return null;
  const pick = rnd();
  const canFact = input.facts.length > 0;
  const canFreeze = input.freezes < MAX_FREEZES;
  if (pick < 0.55 && canFact) {
    const f = input.facts[Math.floor(rnd() * input.facts.length)];
    return { kind: "fact", quote: f.quote, page: f.page, conceptId: f.conceptId };
  }
  if (pick < 0.8 && canFreeze) return { kind: "freeze" };
  return { kind: "xp", amount: XP_CRATE };
}

export function crateCopy(c: Crate): { title: string; body: string } {
  switch (c.kind) {
    case "fact":
      return { title: "A line from your own pages", body: c.page != null ? `From page ${c.page}` : "From your notes" };
    case "freeze":
      return { title: "A streak freeze", body: "It is spent by itself the first day you miss." };
    case "xp":
      return { title: `${c.amount} bonus XP`, body: "Added to your total now." };
  }
}

/* ------------------------------- animation math ---------------------------- */

export function easeOutCubic(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - c, 3);
}

/** The integer shown while counting from `from` to `to`, at progress t in 0..1. */
export function countUp(from: number, to: number, t: number): number {
  return Math.round(from + (to - from) * easeOutCubic(t));
}

export type BurstParticle = { angle: number; distance: number; delay: number; size: number };

/** Deterministic particles around each earned star. More stars, a bigger burst. */
export function burstParticles(stars: number, perStar = 10): BurstParticle[] {
  const out: BurstParticle[] = [];
  const total = Math.max(0, stars) * perStar;
  const rnd = seededRandom(`burst-${stars}`);
  for (let i = 0; i < total; i++) {
    out.push({
      angle: (i / total) * Math.PI * 2 + rnd() * 0.4,
      distance: 46 + rnd() * 54,
      delay: rnd() * 0.25,
      size: 4 + rnd() * 5,
    });
  }
  return out;
}

/** The line under the stars. States what was earned, never flatters a lost level. */
export function starsCopy(stars: 0 | 1 | 2 | 3, won: boolean): string {
  if (!won) return "Not cleared. The retry is free.";
  if (stars === 3) return "Three stars. Every round held up.";
  if (stars === 2) return "Two stars. One heart lost. Replay for the third.";
  return "Cleared. Replay it for more stars.";
}
