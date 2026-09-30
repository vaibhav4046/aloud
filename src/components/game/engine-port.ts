import type { Level, LevelResult, Progress, ProofCard, RoundOutcome, RoundReport, Run } from "@/lib/game/types";

/**
 * The seam between the game screens and the game engine.
 *
 * The screens import the rules, the progress store and the run fetch from this
 * one file and from nowhere else in src/lib/game. The engine lives in
 * src/lib/game (run.ts, scoring.ts, progress.ts, session.ts) and is written by
 * another stream; the functions below are thin adapters over it. Where the
 * engine had not landed when a screen was written, the adapter holds a small
 * local version of the rule from the design brief so the screens run and the
 * screen tests have something real to assert against. Each such rule is marked
 * `local rule` and is replaced by the engine export when it exists.
 */

/* --------------------------------- rules --------------------------------- */

/** local rule: XP per round outcome, before the grounded bonus and multipliers. */
const BASE_XP: Record<RoundOutcome, number> = {
  correct: 100,
  partial: 50,
  bluff_caught: 150,
  bluff_missed: 0,
  incorrect: 0,
  skipped: 0,
};
const GROUNDED_BONUS = 25;
const BOSS_MULTIPLIER = 1.5;

/** local rule: combo multiplier from the number of good rounds in a row. */
export function comboMultiplier(streak: number): number {
  if (streak >= 8) return 2;
  if (streak >= 5) return 1.5;
  if (streak >= 3) return 1.2;
  return 1;
}

/** A round costs a heart when it is wrong or a bluff got past the player. */
export function costsHeart(outcome: RoundOutcome): boolean {
  return outcome === "incorrect" || outcome === "bluff_missed";
}

/** Rounds that build the combo. Partial neither builds nor breaks it. */
export function buildsCombo(outcome: RoundOutcome): boolean {
  return outcome === "correct" || outcome === "bluff_caught";
}

export type RoundScore = { xp: number; multiplier: number };

export function scoreRound(report: Pick<RoundReport, "outcome" | "grounded">, comboBefore: number, isBoss: boolean): RoundScore {
  const base = BASE_XP[report.outcome];
  if (base === 0) return { xp: 0, multiplier: 1 };
  const multiplier = comboMultiplier(comboBefore + (buildsCombo(report.outcome) ? 1 : 0)) * (isBoss ? BOSS_MULTIPLIER : 1);
  const bonus = report.grounded ? GROUNDED_BONUS : 0;
  return { xp: Math.round((base + bonus) * multiplier), multiplier };
}

/** local rule: 3 stars = no wrong rounds and at most 1 partial, 2 = at most 1 heart lost, 1 = won. */
export function starsFor(outcomes: RoundOutcome[], heartsLost: number): 1 | 2 | 3 {
  const wrong = outcomes.filter(costsHeart).length;
  const partial = outcomes.filter((o) => o === "partial").length;
  if (wrong === 0 && partial <= 1) return 3;
  if (heartsLost <= 1) return 2;
  return 1;
}

export type RankInfo = { rank: number; xpIntoRank: number; xpForNext: number; fraction: number; maxed: boolean };

const RANK_MAX = 30;
const RANK_FIRST = 300;
const RANK_GROWTH = 1.08;

/** local rule: the XP that starts rank r (rank 1 starts at 0, rank 2 at 300, each step 8% larger). */
export function rankStart(rank: number): number {
  let total = 0;
  for (let r = 2; r <= rank; r++) total += Math.round(RANK_FIRST * Math.pow(RANK_GROWTH, r - 2));
  return total;
}

export function rankInfo(xp: number): RankInfo {
  let rank = 1;
  while (rank < RANK_MAX && xp >= rankStart(rank + 1)) rank += 1;
  const start = rankStart(rank);
  if (rank >= RANK_MAX) return { rank, xpIntoRank: xp - start, xpForNext: 0, fraction: 1, maxed: true };
  const span = rankStart(rank + 1) - start;
  return { rank, xpIntoRank: xp - start, xpForNext: span, fraction: Math.min(1, (xp - start) / span), maxed: false };
}

/* ------------------------------ result scoring ---------------------------- */

export type FinishedLevel = {
  level: Level;
  reports: RoundReport[];
  proofs: ProofCard[];
  xp: number;
  heartsLeft: number;
  bestCombo: number;
  outcome: "won" | "lost" | "quit";
  now: Date;
};

export function toLevelResult(f: FinishedLevel): LevelResult {
  const outcomes = f.reports.map((r) => r.outcome);
  const lost = f.level.hearts - f.heartsLeft;
  return {
    levelId: f.level.id,
    stars: f.outcome === "won" ? starsFor(outcomes, lost) : 0,
    xp: f.xp,
    heartsLeft: f.heartsLeft,
    bestCombo: f.bestCombo,
    rounds: outcomes,
    proofIds: f.proofs.map((p) => p.id),
    outcome: f.outcome,
    playedAt: f.now.toISOString(),
  };
}

/* --------------------------------- progress ------------------------------- */

const PROGRESS_PREFIX = "aloud.progress.";

export function emptyProgress(run: Run, now: Date): Progress {
  return {
    runId: run.id,
    xp: 0,
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
    todayMinutes: (sameDay || !p.lastPlayedDay || p.lastPlayedDay === today ? p.todayMinutes : 0) + minutes,
    updatedAt: new Date().toISOString(),
  };
  return { progress: merged, rankBefore: p.rank, rankAfter: merged.rank, unlockedNext, freezeEarned, streakExtended };
}

function dayGap(from: string, to: string): number {
  const a = Date.parse(from + "T00:00:00Z");
  const b = Date.parse(to + "T00:00:00Z");
  return Math.round((b - a) / 86_400_000);
}
