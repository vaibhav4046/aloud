import type { Level, ProofCard, RoundReport } from "@/lib/game/types";
import { applyRound, comboMultiplier, proofCardFor, startLevel, type LevelRun } from "./engine-port";

/**
 * The level flow as a pure reducer over the engine's LevelRun. Voice and typed
 * play both feed it the same RoundReport, so the two modes cannot drift: a
 * heart, a combo step and a proof card mean the same thing however the answer
 * arrived. Every number comes from the engine's scoring; this file adds only
 * what a screen needs (the last round's feedback, the hint flag, proof cards
 * built as they land). It never reads a clock or a random number.
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
  run: LevelRun;
  /** Rounds finished so far. */
  roundIndex: number;
  /** Proof cards earned this level, one per verified quote. */
  proofs: ProofCard[];
  last: Feedback | null;
  /** A hint or a peek was taken on the round in progress. */
  hinted: boolean;
  hintsUsed: number;
};

export type PlayAction =
  | { type: "start" }
  | { type: "hint" }
  | { type: "round"; report: RoundReport; now: string }
  | { type: "quit" };

export function initialPlay(level: Level): PlayState {
  return { level, phase: "ready", run: startLevel(level), roundIndex: 0, proofs: [], last: null, hinted: false, hintsUsed: 0 };
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
      const report: RoundReport = { ...a.report, hinted: s.hinted || a.report.hinted === true };
      const { run, delta } = applyRound(s.run, report);
      // A missed round never earns a proof card: the quote did not back the player.
      const card = report.proof && !delta.heartLost ? proofCardFor(s.level.id, report.proof, a.now) : null;
      const fresh = card && !s.proofs.some((p) => p.id === card.id) ? card : null;
      const phase: PlayPhase = run.status === "won" ? "won" : run.status === "lost" ? "lost" : "live";
      return {
        ...s,
        phase,
        run,
        roundIndex: run.rounds.length,
        proofs: fresh ? [...s.proofs, fresh] : s.proofs,
        last: {
          seq: (s.last?.seq ?? 0) + 1,
          outcome: report.outcome,
          xpGain: delta.xpGained,
          multiplier: delta.multiplier,
          heartLost: delta.heartLost,
          comboAfter: delta.comboAfter,
          proof: fresh,
          hinted: report.hinted === true,
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

export function roundsLeft(s: PlayState): number {
  return Math.max(0, s.level.rounds - s.roundIndex);
}
