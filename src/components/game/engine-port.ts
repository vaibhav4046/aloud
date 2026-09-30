import type { Level, LevelResult, Progress, ProofCard, Run } from "@/lib/game/types";
import { rankProgress } from "@/lib/game/scoring";

/**
 * The seam between the game screens and the game engine.
 *
 * The screens import scoring, progress and the run fetch from this one file and
 * from nowhere else in src/lib/game. Scoring comes straight from the engine
 * (src/lib/game/scoring.ts). The progress adapters in the second half are the
 * one part that was still a local rule when the screens were written; each is
 * marked `local rule` and is replaced by the engine's progress.ts export.
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
/** local rule: the head start a new run begins with (endowed progress). */
export const HEAD_START_XP = 60;

export function emptyProgress(run: Run, now: Date): Progress {
  return {
    runId: run.id,
    xp: HEAD_START_XP,
    rank: 1,
    unlockedIndex: 1,
    streakDays: 0,
    lastPlayedDay: null,
    freezes: 0,
    results: {},
    proofs: [],
    weakConceptIds: [],
    dailyGoalMinutes: 10,
    todayMinutes: 0,
    updatedAt: now.toISOString(),
  };
}

export function loadProgress(run: Run, now = new Date()): Progress {
  try {
    const raw = window.localStorage.getItem(PROGRESS_PREFIX + run.id);
    if (raw) {
      const p = JSON.parse(raw) as Progress;
      if (p && p.runId === run.id && typeof p.xp === "number") return p;
    }
  } catch {
    /* private mode or a corrupt entry: start fresh */
  }
  return emptyProgress(run, now);
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

/** local rule: fold one finished level into progress (streak, freeze, unlock, weak concepts). */
export function applyResult(p: Progress, run: Run, level: Level, result: LevelResult, proofs: ProofCard[], minutes: number, today: string): Applied {
  const prevBest = p.results[level.id];
  const keep = prevBest && prevBest.outcome === "won" && prevBest.stars >= result.stars ? prevBest : result;
  const xp = p.xp + result.xp;
  const won = result.outcome === "won";
  const sameDay = p.lastPlayedDay === today;
  let streakDays = p.streakDays;
  let freezes = p.freezes;
  let streakExtended = false;
  let freezeEarned = false;
  if (won && !sameDay) {
    const gap = p.lastPlayedDay ? dayGap(p.lastPlayedDay, today) : 0;
    if (!p.lastPlayedDay || gap === 1) streakDays += 1;
    else if (gap === 2 && freezes > 0) {
      freezes -= 1;
      streakDays += 1;
    } else streakDays = 1;
    streakExtended = true;
    if (streakDays > 0 && streakDays % 7 === 0) {
      freezes += 1;
      freezeEarned = true;
    }
  }
  const weak = new Set(p.weakConceptIds);
  if (won) level.conceptIds.forEach((c) => weak.delete(c));
  else level.conceptIds.forEach((c) => weak.add(c));
  const next = run.levels.find((l) => l.index === level.index + 1);
  const unlockedNext = won && !!next && next.index > p.unlockedIndex;
  const seen = new Set(p.proofs.map((x) => x.id));
  const merged: Progress = {
    ...p,
    xp,
    rank: rankInfo(xp).rank,
    unlockedIndex: unlockedNext && next ? next.index : p.unlockedIndex,
    streakDays,
    freezes,
    lastPlayedDay: won ? today : p.lastPlayedDay,
    results: { ...p.results, [level.id]: keep },
    proofs: [...p.proofs, ...proofs.filter((x) => !seen.has(x.id))],
    weakConceptIds: [...weak],
    todayMinutes: (p.lastPlayedDay === today || !p.lastPlayedDay ? p.todayMinutes : 0) + minutes,
    updatedAt: new Date().toISOString(),
  };
  return { progress: merged, rankBefore: p.rank, rankAfter: merged.rank, unlockedNext, freezeEarned, streakExtended };
}

function dayGap(from: string, to: string): number {
  const a = Date.parse(from + "T00:00:00Z");
  const b = Date.parse(to + "T00:00:00Z");
  return Math.round((b - a) / 86_400_000);
}
