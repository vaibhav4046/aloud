import type { Subject } from "@/lib/courses/types";
import { quoteInPassage } from "@/lib/oral/verify-claim";
import { dayDiff, ENDOWED_XP, freezeLedger, localDay, MAX_FREEZES, FREEZE_EVERY, type Ctx } from "./progress";
import { rankForXp, scoreLevel } from "./scoring";
import type { Level, LevelResult, Progress, ProofCard, Run } from "./types";

/**
 * What the server will and will not believe from a browser.
 *
 * Each round is graded in the player's browser, so the server cannot see how a
 * level was played. What it can do is refuse a report that no play of that
 * level could have produced, and derive everything that follows from results
 * (XP, streak, freezes) instead of accepting the client's totals. A client that
 * lies within what the level can pay still gets the stars it claims.
 */

/** XP a client may report for a crate: at most one crate per won level, each worth this much. */
export const CRATE_XP = 50;

/** A report whose rounds are replayed through scoring: null when a real play could have produced it. */
export function checkResultByReplay(result: LevelResult, level: Level): string | null {
  const replay = (grounded: boolean, hinted: boolean) =>
    scoreLevel(
      level,
      result.rounds.map((outcome) => ({ conceptId: level.conceptIds[0] ?? "", outcome, grounded, hinted, ms: 0 })),
      { playedAt: result.playedAt }
    );
  const top = replay(true, false);
  const bottom = replay(false, true);
  const derived = top.result;
  if (derived.rounds.length !== result.rounds.length) return "rounds after the level had ended";
  if (derived.outcome !== result.outcome) return `the rounds end a level ${derived.outcome}, not ${result.outcome}`;
  if (result.outcome === "won" && result.rounds.length !== level.rounds) return "a won level has every round";
  if (result.outcome === "quit" && result.rounds.length >= level.rounds) return "a quit level has rounds left";
  if (result.stars !== derived.stars) return "stars do not follow from the rounds";
  if (result.heartsLeft !== derived.heartsLeft) return "hearts do not follow from the rounds";
  if (result.bestCombo !== derived.bestCombo) return "combo does not follow from the rounds";
  if (result.xp > derived.xp || result.xp < bottom.result.xp) return "xp does not follow from the rounds";
  return null;
}

/** Proof cards whose quote is verbatim in the passage they name, in this subject's own pages. Each keeps its own level. */
export function verifiedCards(cards: ProofCard[], subject: Subject, levelIds: ReadonlySet<string>): ProofCard[] {
  const passages = new Map(subject.sources.flatMap((s) => s.chunks).map((c) => [c.id, c]));
  return cards.filter((c) => {
    const passage = passages.get(c.passageId);
    return levelIds.has(c.levelId) && passage !== undefined && quoteInPassage(c.quote, passage.text);
  });
}

/** Consecutive played days ending at the latest one, counted from the days the results were played. Never after today. */
export function streakFromResults(results: Progress["results"], ctx: Ctx): { streakDays: number; lastPlayedDay: string | null } {
  const today = localDay(ctx.now, ctx.tz);
  const days = new Set<string>();
  for (const r of Object.values(results)) {
    if (r.outcome !== "won") continue;
    const at = new Date(r.playedAt);
    if (Number.isNaN(at.getTime())) continue;
    const day = localDay(at, ctx.tz);
    if (dayDiff(day, today) >= 0) days.add(day);
  }
  const sorted = [...days].sort();
  if (sorted.length === 0) return { streakDays: 0, lastPlayedDay: null };
  let streak = 1;
  for (let i = sorted.length - 1; i > 0 && dayDiff(sorted[i - 1], sorted[i]) === 1; i--) streak += 1;
  return { streakDays: streak, lastPlayedDay: sorted[sorted.length - 1] };
}

/**
 * A client copy of progress reduced to what its results support. Results and
 * proofs are limited to this run (proof quotes checked against the pages). XP is
 * the endowment plus what the results paid plus crate XP up to one crate per
 * won level. The streak comes from the days the results were played, and
 * freezes from the counters, never above what the streak and the crates could
 * have earned. Rank is derived. Nothing the client says about xp, rank, streak
 * or freezes is read.
 */
export function cleanClientProgress(input: Progress, run: Run, subject: Subject, ctx: Ctx, valid: (r: LevelResult, level: Level) => boolean): Progress {
  const byId = new Map(run.levels.map((l) => [l.id, l]));
  const results: Progress["results"] = {};
  for (const [id, r] of Object.entries(input.results)) {
    const level = byId.get(id);
    if (level && r.levelId === id && valid(r, level)) results[id] = r;
  }
  const won = Object.values(results).filter((r) => r.outcome === "won").length;
  const crateXp = Math.min(input.crateXp ?? 0, won * CRATE_XP);
  const xp = ENDOWED_XP + Object.values(results).reduce((n, r) => n + r.xp, 0) + crateXp;
  const { streakDays, lastPlayedDay } = streakFromResults(results, ctx);
  const ledger = freezeLedger(input);
  const earnedCap = Math.min(20_000, won + Math.floor(streakDays / FREEZE_EVERY));
  const earned = Math.min(ledger.earned, earnedCap);
  const spent = Math.min(ledger.spent, earned);
  return {
    ...input,
    runId: run.id,
    xp,
    rank: rankForXp(xp),
    streakDays,
    lastPlayedDay,
    freezes: Math.max(0, Math.min(MAX_FREEZES, earned - spent)),
    freezesEarned: earned,
    freezesSpent: spent,
    crateXp,
    results,
    proofs: verifiedCards(input.proofs, subject, new Set(byId.keys())),
  };
}
