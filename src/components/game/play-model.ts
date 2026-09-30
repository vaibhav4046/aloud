import type { Level, ProofCard, RoundReport } from "@/lib/game/types";
import { buildsCombo, comboMultiplier, costsHeart, scoreRound } from "./engine-port";

/**
 * The level flow as a pure reducer. Voice and typed play both feed it the same
 * RoundReport, so the two modes cannot drift: a heart, a combo step and a proof
 * card mean the same thing however the answer arrived. The reducer never reads
 * a clock or a random number; the caller passes the time and an id in.
 */

export type PlayPhase = "ready" | "live" | "won" | "lost";

export type Feedback = {
  /** Increments each round so the screen can restart its animation on identical outcomes. */
  seq: number;
  outcome: RoundReport["outcome"];
  xpGain: number;
  multiplier: number;
  heartLost: boolean;
  comboAfter: number;
  proof: ProofCard | null;
  hinted: boolean;
};

export type PlayState = {
  level: Level;
  phase: PlayPhase;
  hearts: number;
  /** Rounds finished so far. */
  roundIndex: number;
  combo: number;
  bestCombo: number;
  xp: number;
  reports: RoundReport[];
  proofs: ProofCard[];
  last: Feedback | null;
  /** A hint was taken on the round in progress. */
  hinted: boolean;
  hintsUsed: number;
};

export type PlayAction =
  | { type: "start" }
  | { type: "hint" }
  | { type: "round"; report: RoundReport; proofId: string; now: string }
  | { type: "quit" };

/** A hint keeps the heart and takes this share of the round's XP. */
export const HINT_XP_SHARE = 0.6;

export function initialPlay(level: Level): PlayState {
  return {
    level,
    phase: "ready",
    hearts: level.hearts,
    roundIndex: 0,
    combo: 0,
    bestCombo: 0,
    xp: 0,
    reports: [],
    proofs: [],
    last: null,
    hinted: false,
    hintsUsed: 0,
  };
}

export function proofIdFor(levelId: string, passageId: string, quote: string): string {
  let h = 5381;
  for (let i = 0; i < quote.length; i++) h = ((h * 33) ^ quote.charCodeAt(i)) >>> 0;
  return `proof_${levelId}_${passageId}_${h.toString(36)}`;
}

export function playReducer(s: PlayState, a: PlayAction): PlayState {
  switch (a.type) {
    case "start":
      return s.phase === "ready" ? { ...s, phase: "live" } : s;
    case "hint":
      return s.phase === "live" && !s.hinted ? { ...s, hinted: true, hintsUsed: s.hintsUsed + 1 } : s;
    case "quit":
      return s.phase === "live" || s.phase === "ready" ? { ...s, phase: "lost" } : s;
    case "round": {
      if (s.phase !== "live") return s;
      const isBoss = s.level.kind === "boss";
      const { report } = a;
      const scored = scoreRound(report, s.combo, isBoss);
      const xpGain = s.hinted ? Math.round(scored.xp * HINT_XP_SHARE) : scored.xp;
      const heartLost = costsHeart(report.outcome);
      const hearts = heartLost ? s.hearts - 1 : s.hearts;
      const combo = buildsCombo(report.outcome) ? s.combo + 1 : report.outcome === "partial" ? s.combo : 0;
      const proof: ProofCard | null =
        report.proof && report.outcome !== "incorrect" && report.outcome !== "bluff_missed"
          ? {
              ...report.proof,
              id: a.proofId,
              levelId: s.level.id,
              earnedAt: a.now,
            }
          : null;
      const dup = proof ? s.proofs.some((p) => p.id === proof.id) : false;
      const roundIndex = s.roundIndex + 1;
      const phase: PlayPhase = hearts <= 0 ? "lost" : roundIndex >= s.level.rounds ? "won" : "live";
      return {
        ...s,
        phase,
        hearts,
        roundIndex,
        combo,
        bestCombo: Math.max(s.bestCombo, combo),
        xp: s.xp + xpGain,
        reports: [...s.reports, report],
        proofs: proof && !dup ? [...s.proofs, proof] : s.proofs,
        last: {
          seq: (s.last?.seq ?? 0) + 1,
          outcome: report.outcome,
          xpGain,
          multiplier: scored.multiplier,
          heartLost,
          comboAfter: combo,
          proof: proof && !dup ? proof : null,
          hinted: s.hinted,
        },
        hinted: false,
      };
    }
  }
}

/* ------------------------------- view helpers ------------------------------ */

export type ComboView = { streak: number; multiplier: number; nextAt: number | null; fill: number };

/** Combo tiers from the brief: x1.2 at 3, x1.5 at 5, x2 at 8. The meter fills toward the next tier. */
export function comboView(streak: number): ComboView {
  const tiers = [0, 3, 5, 8];
  const next = tiers.find((t) => t > streak) ?? null;
  const prev = [...tiers].reverse().find((t) => t <= streak) ?? 0;
  const fill = next === null ? 1 : (streak - prev) / (next - prev);
  return { streak, multiplier: comboMultiplier(streak), nextAt: next, fill };
}

export const OUTCOME_COPY: Record<RoundReport["outcome"], { title: string; tone: "good" | "soft" | "bad" }> = {
  correct: { title: "Right", tone: "good" },
  partial: { title: "Partly there", tone: "soft" },
  incorrect: { title: "Not quite", tone: "bad" },
  bluff_caught: { title: "Bluff caught", tone: "good" },
  bluff_missed: { title: "That one was a bluff", tone: "bad" },
  skipped: { title: "Skipped", tone: "soft" },
};

/** The sentence announced to assistive tech after a round, and shown under the prompt. */
export function announceRound(f: Feedback, hearts: number): string {
  const head = OUTCOME_COPY[f.outcome].title;
  const xp = f.xpGain > 0 ? `, plus ${f.xpGain} XP` : "";
  const heart = f.heartLost ? `, ${hearts} heart${hearts === 1 ? "" : "s"} left` : "";
  return `${head}${xp}${heart}.`;
}

/** Whether the level still has rounds to play. */
export function roundsLeft(s: PlayState): number {
  return Math.max(0, s.level.rounds - s.roundIndex);
}
