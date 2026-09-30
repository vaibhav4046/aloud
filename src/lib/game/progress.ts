import { rankForXp, unlockedIndexFor } from "./scoring";
import type { LevelResult, ProofCard, Progress, Run } from "./types";

/**
 * What the player carries between sessions, and the rules that change it.
 * Pure: every function takes the time it needs as an argument (Ctx) and returns
 * a new Progress. Nothing here touches storage, a clock or a network.
 *
 * Judgement calls, each pinned by a test:
 *  - The streak counts a level the player WON on a local day. A lost attempt adds
 *    play time to the daily ring but does not extend the streak.
 *  - Each missed day costs one freeze. If the player holds fewer freezes than
 *    missed days, the streak resets to 1 and no freeze is spent.
 *  - A freeze is earned each time the streak reaches a multiple of 7, capped at 2.
 *  - A replay pays only the XP above the best it paid before, so rank cannot be farmed.
 *  - A clock that runs backwards (a device clock change, travel west) changes nothing.
 */

export const ENDOWED_XP = 60;
export const DAILY_GOAL_DEFAULT = 10;
export const DAILY_GOAL_MIN = 1;
export const DAILY_GOAL_MAX = 120;
export const FREEZE_EVERY = 7;
export const MAX_FREEZES = 2;
export const MAX_PROOFS = 300;
export const MAX_WEAK = 12;

/** The injectable clock. `tz` is an IANA zone name; anything Intl rejects falls back to UTC. */
export type Ctx = { now: Date; tz?: string };

/** The player's local calendar day, "YYYY-MM-DD". */
export function localDay(now: Date, tz = "UTC"): string {
  const parts = (zone: string) => new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  try {
    return parts(tz);
  } catch {
    return parts("UTC");
  }
}

const DAY_MS = 86_400_000;

/** Whole days from a to b (both "YYYY-MM-DD"). Negative when b is earlier. */
export function dayDiff(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / DAY_MS);
}

export function newProgress(runId: string, ctx: Ctx): Progress {
  return {
    runId,
    xp: ENDOWED_XP,
    rank: rankForXp(ENDOWED_XP),
    unlockedIndex: 1,
    streakDays: 0,
    lastPlayedDay: null,
    freezes: 0,
    freezesEarned: 0,
    freezesSpent: 0,
    crateXp: 0,
    results: {},
    proofs: [],
    weakConceptIds: [],
    dailyGoalMinutes: DAILY_GOAL_DEFAULT,
    todayMinutes: 0,
    todayDay: localDay(ctx.now, ctx.tz),
    updatedAt: ctx.now.toISOString(),
  };
}

/* ---------- streak ---------- */

export type StreakStatus = {
  /** Show this number. It is 0 once the streak is broken. */
  days: number;
  state: "none" | "safe" | "at_risk" | "broken";
  missedDays: number;
  freezesNeeded: number;
  freezes: number;
  playedToday: boolean;
};

export function streakStatus(p: Progress, ctx: Ctx): StreakStatus {
  const today = localDay(ctx.now, ctx.tz);
  const base = { freezes: p.freezes, missedDays: 0, freezesNeeded: 0 };
  if (!p.lastPlayedDay) return { ...base, days: 0, state: "none", playedToday: false };
  const gap = dayDiff(p.lastPlayedDay, today);
  if (gap <= 0) return { ...base, days: p.streakDays, state: "safe", playedToday: true };
  if (gap === 1) return { ...base, days: p.streakDays, state: "at_risk", playedToday: false };
  const missed = gap - 1;
  const covered = p.freezes >= missed;
  return { ...base, missedDays: missed, freezesNeeded: missed, days: covered ? p.streakDays : 0, state: covered ? "at_risk" : "broken", playedToday: false };
}

/**
 * Freezes are two monotonic counters, earned and spent, and the number held is
 * earned minus spent (at most MAX_FREEZES). Counters merge by taking the larger
 * of each side, so a freeze earned on one device is never dropped by a merge
 * and a freeze spent on one is never handed back. A copy from before the
 * counters existed starts from the freezes it holds.
 */
export function freezeLedger(p: Pick<Progress, "freezes" | "freezesEarned" | "freezesSpent">): { earned: number; spent: number } {
  const spent = p.freezesSpent ?? 0;
  // A copy that was edited without its counters still holds what it says it holds.
  return { earned: Math.max(p.freezesEarned ?? 0, spent + p.freezes), spent };
}

const heldFreezes = (earned: number, spent: number): number => Math.max(0, Math.min(MAX_FREEZES, earned - spent));

function withLedger(p: Progress, earned: number, spent: number): Progress {
  return { ...p, freezesEarned: earned, freezesSpent: spent, freezes: heldFreezes(earned, spent) };
}

/** A freeze earned outside the streak (a crate). Nothing is counted when the player already holds the most. */
export function grantFreeze(p: Progress): Progress {
  const { earned, spent } = freezeLedger(p);
  return heldFreezes(earned, spent) >= MAX_FREEZES ? withLedger(p, earned, spent) : withLedger(p, earned + 1, spent);
}

/** Bonus XP from a crate. Kept in its own counter so the server can tell it from XP a level paid. */
export function grantCrateXp(p: Progress, amount: number): Progress {
  return { ...p, xp: p.xp + amount, rank: rankForXp(p.xp + amount), crateXp: (p.crateXp ?? 0) + amount };
}

/** Record that a level was finished today. Returns the same object when nothing changes. */
export function touchStreak(p: Progress, ctx: Ctx): Progress {
  const today = localDay(ctx.now, ctx.tz);
  if (p.lastPlayedDay === null) return { ...p, streakDays: 1, lastPlayedDay: today };
  const gap = dayDiff(p.lastPlayedDay, today);
  if (gap <= 0) return p;
  let { earned, spent } = freezeLedger(p);
  let streakDays = 1;
  if (gap === 1) {
    streakDays = p.streakDays + 1;
  } else if (p.freezes >= gap - 1) {
    streakDays = p.streakDays + 1;
    spent += gap - 1;
  }
  if (streakDays > p.streakDays && streakDays % FREEZE_EVERY === 0 && heldFreezes(earned, spent) < MAX_FREEZES) earned += 1;
  return withLedger({ ...p, streakDays, lastPlayedDay: today }, earned, spent);
}

/* ---------- daily goal ---------- */

export function addMinutes(p: Progress, minutes: number, ctx: Ctx): Progress {
  const today = localDay(ctx.now, ctx.tz);
  const carried = p.todayDay === today ? p.todayMinutes : 0;
  const add = Number.isFinite(minutes) ? Math.max(0, minutes) : 0;
  return { ...p, todayDay: today, todayMinutes: Math.round((carried + add) * 100) / 100 };
}

export function dailyGoalFraction(p: Progress, ctx: Ctx): number {
  if (p.todayDay !== localDay(ctx.now, ctx.tz) || p.dailyGoalMinutes <= 0) return 0;
  return Math.min(1, p.todayMinutes / p.dailyGoalMinutes);
}

export function setDailyGoal(p: Progress, minutes: number, ctx: Ctx): Progress {
  const goal = Math.min(DAILY_GOAL_MAX, Math.max(DAILY_GOAL_MIN, Math.round(Number.isFinite(minutes) ? minutes : DAILY_GOAL_DEFAULT)));
  return { ...p, dailyGoalMinutes: goal, updatedAt: ctx.now.toISOString() };
}

/* ---------- applying a level ---------- */

/** Better play of one level: more stars, then more XP. The XP kept is the most ever paid. */
export function betterResult(a: LevelResult, b: LevelResult): LevelResult {
  const xp = Math.max(a.xp, b.xp);
  const pick = b.stars > a.stars || (b.stars === a.stars && b.xp > a.xp) || (b.stars === a.stars && b.xp === a.xp && b.playedAt > a.playedAt) ? b : a;
  return { ...pick, xp };
}

const capTail = <T>(list: T[], n: number): T[] => (list.length > n ? list.slice(list.length - n) : list);

function mergeProofs(existing: ProofCard[], incoming: ProofCard[]): ProofCard[] {
  const seen = new Set(existing.map((c) => c.id));
  const fresh = incoming.filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)));
  return capTail([...existing, ...fresh], MAX_PROOFS);
}

function updateWeak(weak: string[], result: LevelResult): string[] {
  const cleared = new Set(result.clearedConceptIds ?? []);
  const kept = weak.filter((id) => !cleared.has(id));
  const added = (result.missedConceptIds ?? []).filter((id) => !kept.includes(id));
  return capTail([...kept, ...added], MAX_WEAK);
}

/**
 * Apply one finished level. Idempotent on (levelId, playedAt): the same result
 * applied twice returns the same object. A level not in the run is ignored.
 */
export function applyLevelResult(p: Progress, run: Run, result: LevelResult, proofs: ProofCard[], ctx: Ctx): Progress {
  if (!run.levels.some((l) => l.id === result.levelId)) return p;
  const prev = p.results[result.levelId];
  if (prev && prev.playedAt === result.playedAt) return p;
  const stored = prev ? betterResult(prev, result) : result;
  const gained = Math.max(0, result.xp - (prev?.xp ?? 0));
  const results = { ...p.results, [result.levelId]: stored };
  const xp = p.xp + gained;
  let next: Progress = {
    ...p,
    runId: run.id,
    xp,
    rank: rankForXp(xp),
    results,
    unlockedIndex: unlockedIndexFor(run.levels, results),
    proofs: mergeProofs(p.proofs, proofs),
    weakConceptIds: updateWeak(p.weakConceptIds, result),
    updatedAt: ctx.now.toISOString(),
  };
  if (result.outcome === "won") next = touchStreak(next, ctx);
  return addMinutes(next, (result.ms ?? 0) / 60_000, ctx);
}

/**
 * Recompute the fields derived from the run: the unlock frontier and the rank.
 * Results for levels that are not in the run (a regenerated run drops some) are
 * removed; the XP they paid stays, so nothing already earned is lost.
 */
export function rebaseProgress(p: Progress, run: Run): Progress {
  const ids = new Set(run.levels.map((l) => l.id));
  const results = Object.fromEntries(Object.entries(p.results).filter(([id]) => ids.has(id)));
  return { ...p, results, unlockedIndex: unlockedIndexFor(run.levels, results), rank: rankForXp(p.xp) };
}

/* ---------- merge ---------- */

const laterFirst = (a: Progress, b: Progress): boolean =>
  a.updatedAt > b.updatedAt || (a.updatedAt === b.updatedAt && a.xp >= b.xp);

/**
 * Merge two copies of the same player's progress (this device and the server).
 * Nothing the player earned is lost: results keep the better play, XP never
 * decreases, proofs are unioned. Streak and daily minutes follow the copy that
 * played most recently. The result does not depend on argument order when the
 * two copies differ in updatedAt.
 */
export function mergeProgress(a: Progress, b: Progress, run?: Run): Progress {
  const winner = laterFirst(a, b) ? a : b;
  const loser = winner === a ? b : a;

  const results: Progress["results"] = { ...loser.results };
  for (const [id, r] of Object.entries(winner.results)) results[id] = results[id] ? betterResult(results[id], r) : r;
  const derivedXp = ENDOWED_XP + Object.values(results).reduce((n, r) => n + r.xp, 0);
  const xp = Math.max(a.xp, b.xp, derivedXp);

  const aLast = a.lastPlayedDay ?? "";
  const bLast = b.lastPlayedDay ?? "";
  const streakSource = aLast > bLast ? a : bLast > aLast ? b : a.streakDays >= b.streakDays ? a : b;
  const ledgerA = freezeLedger(a);
  const ledgerB = freezeLedger(b);
  const earned = Math.max(ledgerA.earned, ledgerB.earned);
  const spent = Math.max(ledgerA.spent, ledgerB.spent);

  const clearedByWinner = new Set(Object.values(winner.results).flatMap((r) => r.clearedConceptIds ?? []));
  const weak = capTail([...winner.weakConceptIds, ...loser.weakConceptIds.filter((id) => !clearedByWinner.has(id) && !winner.weakConceptIds.includes(id))], MAX_WEAK);

  const proofs = capTail(
    mergeProofs(loser.proofs, winner.proofs).sort((x, y) => (x.earnedAt < y.earnedAt ? -1 : x.earnedAt > y.earnedAt ? 1 : 0)),
    MAX_PROOFS
  );

  const aDay = a.todayDay ?? "";
  const bDay = b.todayDay ?? "";
  const todayDay = aDay >= bDay ? a.todayDay ?? null : b.todayDay ?? null;
  const todayMinutes = aDay === bDay ? Math.max(a.todayMinutes, b.todayMinutes) : aDay > bDay ? a.todayMinutes : b.todayMinutes;

  const merged: Progress = {
    runId: winner.runId,
    xp,
    rank: rankForXp(xp),
    unlockedIndex: Math.max(a.unlockedIndex, b.unlockedIndex),
    streakDays: streakSource.streakDays,
    lastPlayedDay: aLast >= bLast ? a.lastPlayedDay : b.lastPlayedDay,
    freezes: heldFreezes(earned, spent),
    freezesEarned: earned,
    freezesSpent: spent,
    crateXp: Math.max(a.crateXp ?? 0, b.crateXp ?? 0),
    results,
    proofs,
    weakConceptIds: weak,
    dailyGoalMinutes: winner.dailyGoalMinutes,
    todayMinutes,
    todayDay,
    updatedAt: a.updatedAt >= b.updatedAt ? a.updatedAt : b.updatedAt,
  };
  return run ? rebaseProgress(merged, run) : merged;
}
