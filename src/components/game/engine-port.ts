import type { LevelResult, Progress, ProofCard, Run } from "@/lib/game/types";
import { rankProgress } from "@/lib/game/scoring";
import { applyLevelResult, ENDOWED_XP, localDay, mergeProgress, newProgress, rebaseProgress, setDailyGoal, streakStatus, dailyGoalFraction, type Ctx, type StreakStatus } from "@/lib/game/progress";

/**
 * The seam between the game screens and the game engine.
 *
 * The screens import scoring and progress from this one file and from nowhere
 * else in src/lib/game. Everything here is the engine's own code (scoring.ts,
 * progress.ts); the only additions are the browser pieces the engine leaves out
 * on purpose: the time zone, localStorage, and a summary of what a finished
 * level changed, for the result screen.
 */

export {
  applyRound,
  comboMultiplier,
  finishLevel,
  isMiss,
  isSuccess,
  proofCardFor,
  rankForXp,
  rankProgress,
  startLevel,
  starsFor,
  xpForRank,
  type LevelRun,
  type RoundDelta,
} from "@/lib/game/scoring";

export type RankInfo = { rank: number; xpIntoRank: number; xpForNext: number; fraction: number; maxed: boolean };

/** The rank card's numbers. `xpForNext` is 0 at the top rank, where `maxed` is true. */
export function rankInfo(xp: number): RankInfo {
  const r = rankProgress(xp);
  return { rank: r.rank, xpIntoRank: r.xpIntoRank, xpForNext: r.xpForNext ?? 0, fraction: r.fraction, maxed: r.xpForNext === null };
}

/* --------------------------------- progress ------------------------------- */

const PROGRESS_PREFIX = "aloud.progress.";

export { ENDOWED_XP, localDay, mergeProgress, setDailyGoal, streakStatus, dailyGoalFraction };
export type { Ctx, StreakStatus };

/** The player's clock: now, in the time zone their browser reports. */
export function clockNow(): Ctx {
  let tz = "UTC";
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    /* no Intl time zone: UTC */
  }
  return { now: new Date(), tz };
}

export function loadProgress(run: Run, ctx: Ctx = clockNow()): Progress {
  try {
    const raw = window.localStorage.getItem(PROGRESS_PREFIX + run.id);
    if (raw) {
      const p = JSON.parse(raw) as Progress;
      if (p && p.runId === run.id && typeof p.xp === "number") return rebaseProgress(p, run);
    }
  } catch {
    /* private mode or a corrupt entry: start fresh */
  }
  return newProgress(run.id, ctx);
}

export function saveProgress(p: Progress): void {
  try {
    window.localStorage.setItem(PROGRESS_PREFIX + p.runId, JSON.stringify(p));
  } catch {
    /* storage blocked: the session still works, it just is not kept */
  }
}

export type Applied = {
  progress: Progress;
  rankBefore: number;
  rankAfter: number;
  unlockedNext: boolean;
  freezeEarned: boolean;
  streakExtended: boolean;
};

/** Fold one finished level into progress with the engine's rules and say what changed. */
export function applyResult(p: Progress, run: Run, result: LevelResult, proofs: ProofCard[], ctx: Ctx): Applied {
  const next = applyLevelResult(p, run, result, proofs, ctx);
  const streakExtended = next.streakDays > p.streakDays || (p.lastPlayedDay === null && next.lastPlayedDay !== null);
  return {
    progress: next,
    rankBefore: p.rank,
    rankAfter: next.rank,
    unlockedNext: next.unlockedIndex > p.unlockedIndex,
    freezeEarned: next.freezes > p.freezes && next.streakDays > p.streakDays,
    streakExtended,
  };
}
