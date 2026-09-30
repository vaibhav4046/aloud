import type { Level, LevelKind, LevelResult, ProofCard, RoundOutcome, RoundReport } from "./types";
import { shortHash } from "./hash";

/**
 * The scoring rules of the game, exactly as written in docs/GAME-DESIGN.md.
 * Pure: no clock, no storage, no randomness. Every number a screen shows
 * (XP, combo, hearts, stars, rank) comes from here.
 *
 * Judgement calls where the design doc is silent, each pinned by a test:
 *  - Combo counts consecutive successes (correct or bluff_caught). The round that
 *    reaches 3 is the first to pay x1.2. A partial keeps the combo but does not
 *    advance it. A miss (incorrect or bluff_missed) resets it. A skip changes nothing.
 *  - The grounded bonus is added before the combo and boss multipliers, and only
 *    to a scoring round (correct, partial, bluff_caught).
 *  - A round taken with a hint pays half. A hint never costs a heart.
 *  - A lost or abandoned level pays 0 XP. Proof cards earned are still kept.
 *  - 3 stars needs every round answered: no miss, no skip, at most one partial.
 */

export const HEARTS_DEFAULT = 3;
export const HEARTS_BOSS = 4;
export const XP_CORRECT = 100;
export const XP_PARTIAL = 50;
export const XP_BLUFF_CAUGHT = 150;
export const XP_GROUNDED_BONUS = 25;
export const BOSS_MULTIPLIER = 1.5;
export const HINT_FACTOR = 0.5;
export const MAX_RANK = 30;
export const FIRST_RANK_XP = 300;
export const RANK_GROWTH = 1.08;

export function heartsFor(kind: LevelKind): number {
  return kind === "boss" ? HEARTS_BOSS : HEARTS_DEFAULT;
}

/** A miss costs a heart and resets the combo. */
export function isMiss(outcome: RoundOutcome): boolean {
  return outcome === "incorrect" || outcome === "bluff_missed";
}

/** A success advances the combo. */
export function isSuccess(outcome: RoundOutcome): boolean {
  return outcome === "correct" || outcome === "bluff_caught";
}

/** x1.0 below 3 in a row, x1.2 from 3, x1.5 from 5, x2 from 8. */
export function comboMultiplier(combo: number): number {
  if (combo >= 8) return 2;
  if (combo >= 5) return 1.5;
  if (combo >= 3) return 1.2;
  return 1;
}

export function baseXp(outcome: RoundOutcome): number {
  if (outcome === "correct") return XP_CORRECT;
  if (outcome === "partial") return XP_PARTIAL;
  if (outcome === "bluff_caught") return XP_BLUFF_CAUGHT;
  return 0;
}

/** The state of a level in play. Immutable: applyRound returns a new one. */
export type LevelRun = {
  levelId: string;
  kind: LevelKind;
  heartsMax: number;
  hearts: number;
  totalRounds: number;
  combo: number;
  bestCombo: number;
  xp: number;
  rounds: RoundOutcome[];
  missedConceptIds: string[];
  clearedConceptIds: string[];
  proofs: NonNullable<RoundReport["proof"]>[];
  ms: number;
  status: "playing" | "won" | "lost";
};

export type RoundDelta = {
  outcome: RoundOutcome;
  xpGained: number;
  multiplier: number;
  heartLost: boolean;
  comboAfter: number;
};

export function startLevel(level: Pick<Level, "id" | "kind" | "hearts" | "rounds">): LevelRun {
  return {
    levelId: level.id,
    kind: level.kind,
    heartsMax: level.hearts,
    hearts: level.hearts,
    totalRounds: level.rounds,
    combo: 0,
    bestCombo: 0,
    xp: 0,
    rounds: [],
    missedConceptIds: [],
    clearedConceptIds: [],
    proofs: [],
    ms: 0,
    status: "playing",
  };
}

const pushUnique = (list: string[], id: string): string[] => (list.includes(id) ? list : [...list, id]);
const without = (list: string[], id: string): string[] => list.filter((x) => x !== id);

/** Fold one round into the level. A finished level ignores further reports. */
export function applyRound(run: LevelRun, report: RoundReport): { run: LevelRun; delta: RoundDelta } {
  if (run.status !== "playing") {
    return { run, delta: { outcome: report.outcome, xpGained: 0, multiplier: 1, heartLost: false, comboAfter: run.combo } };
  }
  const outcome = report.outcome;
  const miss = isMiss(outcome);
  const comboAfter = miss ? 0 : isSuccess(outcome) ? run.combo + 1 : run.combo;
  const scoring = outcome === "correct" || outcome === "partial" || outcome === "bluff_caught";
  const multiplier = scoring ? comboMultiplier(comboAfter) * (run.kind === "boss" ? BOSS_MULTIPLIER : 1) : 1;
  const raw = scoring ? baseXp(outcome) + (report.grounded ? XP_GROUNDED_BONUS : 0) : 0;
  const hinted = scoring && report.hinted === true;
  const xpGained = Math.round(raw * multiplier * (hinted ? HINT_FACTOR : 1));
  const hearts = miss ? Math.max(0, run.hearts - 1) : run.hearts;
  const rounds = [...run.rounds, outcome];
  const status: LevelRun["status"] = hearts === 0 ? "lost" : rounds.length >= run.totalRounds ? "won" : "playing";
  const id = report.conceptId;
  const next: LevelRun = {
    ...run,
    hearts,
    combo: comboAfter,
    bestCombo: Math.max(run.bestCombo, comboAfter),
    xp: run.xp + xpGained,
    rounds,
    missedConceptIds: miss ? pushUnique(run.missedConceptIds, id) : isSuccess(outcome) ? without(run.missedConceptIds, id) : run.missedConceptIds,
    clearedConceptIds: isSuccess(outcome) ? pushUnique(run.clearedConceptIds, id) : miss ? without(run.clearedConceptIds, id) : run.clearedConceptIds,
    proofs: report.proof ? [...run.proofs, report.proof] : run.proofs,
    ms: run.ms + Math.max(0, Math.round(report.ms)),
    status,
  };
  return { run: next, delta: { outcome, xpGained, multiplier, heartLost: miss, comboAfter } };
}

/** 3 = every round answered, none missed, at most one partial. 2 = at most one heart lost. 1 = won. */
export function starsFor(rounds: RoundOutcome[], status: LevelRun["status"]): 0 | 1 | 2 | 3 {
  if (status !== "won") return 0;
  const misses = rounds.filter(isMiss).length;
  const partials = rounds.filter((o) => o === "partial").length;
  const skips = rounds.filter((o) => o === "skipped").length;
  if (misses === 0 && skips === 0 && partials <= 1) return 3;
  if (misses <= 1) return 2;
  return 1;
}

/** The proof card a verified quote becomes. The id is stable so a replay never duplicates it. */
export function proofCardFor(levelId: string, proof: NonNullable<RoundReport["proof"]>, earnedAt: string): ProofCard {
  return { ...proof, id: `proof_${shortHash(`${proof.passageId}|${proof.quote}`)}`, levelId, earnedAt };
}

function dedupeProofs(cards: ProofCard[]): ProofCard[] {
  const seen = new Set<string>();
  return cards.filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)));
}

/** Close a level into a LevelResult. A level still in play closes as "quit". */
export function finishLevel(run: LevelRun, opts: { playedAt: string }): { result: LevelResult; proofs: ProofCard[] } {
  const outcome: LevelResult["outcome"] = run.status === "won" ? "won" : run.status === "lost" ? "lost" : "quit";
  const proofs = dedupeProofs(run.proofs.map((p) => proofCardFor(run.levelId, p, opts.playedAt)));
  const result: LevelResult = {
    levelId: run.levelId,
    stars: starsFor(run.rounds, run.status),
    xp: outcome === "won" ? run.xp : 0,
    heartsLeft: run.hearts,
    bestCombo: run.bestCombo,
    rounds: run.rounds,
    proofIds: proofs.map((p) => p.id),
    outcome,
    playedAt: opts.playedAt,
    ms: run.ms,
    missedConceptIds: run.missedConceptIds,
    clearedConceptIds: run.clearedConceptIds,
  };
  return { result, proofs };
}

/** Score a whole level from its reports in one call. Extra reports after a win or loss are ignored. */
export function scoreLevel(
  level: Pick<Level, "id" | "kind" | "hearts" | "rounds">,
  reports: RoundReport[],
  opts: { playedAt: string }
): { result: LevelResult; proofs: ProofCard[]; deltas: RoundDelta[] } {
  let run = startLevel(level);
  const deltas: RoundDelta[] = [];
  for (const r of reports) {
    if (run.status !== "playing") break;
    const step = applyRound(run, r);
    run = step.run;
    deltas.push(step.delta);
  }
  return { ...finishLevel(run, opts), deltas };
}

/** The most XP a level can pay: every round a grounded bluff catch at the top combo, boss multiplier included. Bounds a client-reported result. */
export function maxXpForLevel(level: Pick<Level, "kind" | "rounds">): number {
  let total = 0;
  for (let i = 1; i <= level.rounds; i++) {
    total += Math.round((XP_BLUFF_CAUGHT + XP_GROUNDED_BONUS) * comboMultiplier(i) * (level.kind === "boss" ? BOSS_MULTIPLIER : 1));
  }
  return total;
}

/** Cumulative XP needed to reach a rank. Rank 1 is 0 XP, rank 2 is 300, each step 8% larger than the one before. */
export function xpForRank(rank: number): number {
  const r = Math.max(1, Math.min(MAX_RANK, Math.floor(rank)));
  if (r === 1) return 0;
  return Math.round((FIRST_RANK_XP * (Math.pow(RANK_GROWTH, r - 1) - 1)) / (RANK_GROWTH - 1));
}

export function rankForXp(xp: number): number {
  const x = Number.isFinite(xp) ? Math.max(0, xp) : 0;
  let rank = 1;
  while (rank < MAX_RANK && x >= xpForRank(rank + 1)) rank += 1;
  return rank;
}

export type RankProgress = { rank: number; xpIntoRank: number; xpForNext: number | null; fraction: number };

/** Where the player sits inside the current rank, for the profile ring. Max rank reports fraction 1. */
export function rankProgress(xp: number): RankProgress {
  const x = Math.max(0, Number.isFinite(xp) ? xp : 0);
  const rank = rankForXp(x);
  const floor = xpForRank(rank);
  if (rank >= MAX_RANK) return { rank, xpIntoRank: x - floor, xpForNext: null, fraction: 1 };
  const span = xpForRank(rank + 1) - floor;
  return { rank, xpIntoRank: x - floor, xpForNext: span, fraction: Math.min(1, (x - floor) / span) };
}

/**
 * Highest unlocked level index. Levels unlock in order and a level needs 1 star
 * to open the next, so this is one past the last level of the unbroken run of
 * starred levels from the start, capped at the last level. Level 1 is always open.
 */
export function unlockedIndexFor(
  levels: readonly Pick<Level, "id" | "index">[],
  results: Record<string, Pick<LevelResult, "stars">>
): number {
  const ordered = levels.slice().sort((a, b) => a.index - b.index);
  let unlocked = 1;
  for (const lv of ordered) {
    if ((results[lv.id]?.stars ?? 0) >= 1) unlocked = Math.min(ordered.length, lv.index + 1);
    else break;
  }
  return unlocked;
}

export function isLevelUnlocked(levelIndex: number, unlockedIndex: number): boolean {
  return levelIndex >= 1 && levelIndex <= unlockedIndex;
}
