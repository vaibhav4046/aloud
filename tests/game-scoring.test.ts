import { describe, expect, it } from "vitest";
import {
  applyRound,
  comboMultiplier,
  finishLevel,
  heartsFor,
  isLevelUnlocked,
  maxXpForLevel,
  rankForXp,
  rankProgress,
  scoreLevel,
  startLevel,
  starsFor,
  unlockedIndexFor,
  xpForRank,
} from "@/lib/game/scoring";
import type { RoundOutcome, RoundReport } from "@/lib/game/types";

const say = { id: "l1", kind: "say" as const, hearts: 3, rounds: 4 };
const boss = { id: "b1", kind: "boss" as const, hearts: 4, rounds: 4 };
const NOW = "2026-09-30T10:00:00.000Z";

const r = (outcome: RoundOutcome, over: Partial<RoundReport> = {}): RoundReport => ({
  conceptId: "c1",
  outcome,
  grounded: false,
  ms: 1000,
  ...over,
});

describe("hearts", () => {
  it("gives 3 hearts, and 4 to a boss", () => {
    expect(heartsFor("say")).toBe(3);
    expect(heartsFor("catch")).toBe(3);
    expect(heartsFor("recall")).toBe(3);
    expect(heartsFor("boss")).toBe(4);
  });

  it("costs one heart per incorrect answer and per missed bluff, nothing else", () => {
    let run = startLevel({ ...say, rounds: 8 });
    run = applyRound(run, r("incorrect")).run;
    expect(run.hearts).toBe(2);
    run = applyRound(run, r("bluff_missed")).run;
    expect(run.hearts).toBe(1);
    run = applyRound(run, r("partial")).run;
    run = applyRound(run, r("skipped")).run;
    run = applyRound(run, r("correct")).run;
    run = applyRound(run, r("bluff_caught")).run;
    expect(run.hearts).toBe(1);
    expect(run.status).toBe("playing");
  });

  it("ends the level as lost at zero hearts and ignores what comes after", () => {
    const { result, deltas } = scoreLevel(say, [r("incorrect"), r("incorrect"), r("bluff_missed"), r("correct"), r("correct")], { playedAt: NOW });
    expect(result.outcome).toBe("lost");
    expect(result.heartsLeft).toBe(0);
    expect(result.stars).toBe(0);
    expect(result.rounds).toHaveLength(3);
    expect(deltas).toHaveLength(3);
  });

  it("gives a boss 4 hearts before it falls", () => {
    const three = scoreLevel({ ...boss, rounds: 8 }, [r("incorrect"), r("incorrect"), r("incorrect"), r("correct")], { playedAt: NOW });
    expect(three.result.heartsLeft).toBe(1);
    expect(three.result.outcome).toBe("quit");
    const four = scoreLevel({ ...boss, rounds: 8 }, [r("incorrect"), r("incorrect"), r("incorrect"), r("incorrect"), r("correct")], { playedAt: NOW });
    expect(four.result.outcome).toBe("lost");
  });
});

describe("xp per round", () => {
  const one = (o: RoundOutcome, over: Partial<RoundReport> = {}) => applyRound(startLevel(say), r(o, over)).delta.xpGained;

  it("pays 100 for correct, 50 for partial, 150 for a caught bluff, 0 otherwise", () => {
    expect(one("correct")).toBe(100);
    expect(one("partial")).toBe(50);
    expect(one("bluff_caught")).toBe(150);
    expect(one("incorrect")).toBe(0);
    expect(one("bluff_missed")).toBe(0);
    expect(one("skipped")).toBe(0);
  });

  it("adds 25 when the round is grounded on a page, on scoring rounds only", () => {
    expect(one("correct", { grounded: true })).toBe(125);
    expect(one("partial", { grounded: true })).toBe(75);
    expect(one("bluff_caught", { grounded: true })).toBe(175);
    expect(one("incorrect", { grounded: true })).toBe(0);
  });

  it("halves a hinted round and never charges a heart for it", () => {
    const step = applyRound(startLevel(say), r("correct", { hinted: true }));
    expect(step.delta.xpGained).toBe(50);
    expect(step.run.hearts).toBe(3);
  });

  it("multiplies boss rounds by 1.5", () => {
    expect(applyRound(startLevel(boss), r("correct")).delta.xpGained).toBe(150);
    expect(applyRound(startLevel(boss), r("bluff_caught", { grounded: true })).delta.xpGained).toBe(263);
  });
});

describe("combo", () => {
  it("steps x1.0, x1.2 at 3, x1.5 at 5, x2 at 8", () => {
    expect([0, 1, 2].map(comboMultiplier)).toEqual([1, 1, 1]);
    expect([3, 4].map(comboMultiplier)).toEqual([1.2, 1.2]);
    expect([5, 6, 7].map(comboMultiplier)).toEqual([1.5, 1.5, 1.5]);
    expect([8, 9, 30].map(comboMultiplier)).toEqual([2, 2, 2]);
  });

  it("pays the multiplier on the round that reaches the threshold", () => {
    let run = startLevel({ ...say, rounds: 12 });
    const paid: number[] = [];
    for (let i = 0; i < 8; i++) {
      const step = applyRound(run, r("correct"));
      run = step.run;
      paid.push(step.delta.xpGained);
    }
    expect(paid).toEqual([100, 100, 120, 120, 150, 150, 150, 200]);
    expect(run.bestCombo).toBe(8);
  });

  it("resets on a miss, holds on a partial or a skip, advances on a caught bluff", () => {
    let run = startLevel({ ...say, rounds: 12 });
    for (const o of ["correct", "correct", "partial", "skipped", "bluff_caught"] as RoundOutcome[]) run = applyRound(run, r(o)).run;
    expect(run.combo).toBe(3);
    run = applyRound(run, r("incorrect")).run;
    expect(run.combo).toBe(0);
    expect(run.bestCombo).toBe(3);
    expect(applyRound(run, r("correct")).delta.xpGained).toBe(100);
  });

  it("stacks the boss multiplier on the combo multiplier", () => {
    let run = startLevel({ ...boss, rounds: 8 });
    run = applyRound(run, r("correct")).run;
    run = applyRound(run, r("correct")).run;
    expect(applyRound(run, r("correct")).delta.xpGained).toBe(180);
  });
});

describe("stars", () => {
  it("gives 3 when no round is missed, none skipped and at most one is partial", () => {
    expect(starsFor(["correct", "correct", "bluff_caught"], "won")).toBe(3);
    expect(starsFor(["correct", "partial", "correct"], "won")).toBe(3);
  });

  it("gives 2 for two partials or for exactly one heart lost", () => {
    expect(starsFor(["partial", "partial", "correct"], "won")).toBe(2);
    expect(starsFor(["correct", "incorrect", "correct"], "won")).toBe(2);
    expect(starsFor(["bluff_missed", "correct", "correct"], "won")).toBe(2);
  });

  it("gives 1 for a win with two or more hearts lost", () => {
    expect(starsFor(["incorrect", "bluff_missed", "correct"], "won")).toBe(1);
  });

  it("does not give 3 stars to a skipped round", () => {
    expect(starsFor(["correct", "skipped", "correct"], "won")).toBe(2);
  });

  it("gives 0 to a level that was not won", () => {
    expect(starsFor(["correct"], "playing")).toBe(0);
    expect(starsFor(["incorrect", "incorrect", "incorrect"], "lost")).toBe(0);
  });
});

describe("level result", () => {
  it("pays the summed XP on a win and 0 on a loss or a quit", () => {
    const won = scoreLevel(say, [r("correct"), r("correct"), r("correct"), r("correct")], { playedAt: NOW });
    expect(won.result.outcome).toBe("won");
    expect(won.result.xp).toBe(100 + 100 + 120 + 120);
    expect(won.result.stars).toBe(3);
    expect(won.result.bestCombo).toBe(4);
    const quit = scoreLevel(say, [r("correct"), r("correct")], { playedAt: NOW });
    expect(quit.result.outcome).toBe("quit");
    expect(quit.result.xp).toBe(0);
    expect(quit.result.stars).toBe(0);
  });

  it("keeps proof cards from a lost level and dedupes a repeated quote", () => {
    const proof = { conceptId: "c1", quote: "Attention weights answer how much a token listens.", page: 5, passageId: "ch_sa_2" };
    const lost = scoreLevel({ ...say, rounds: 6 }, [r("correct", { proof }), r("correct", { proof }), r("incorrect"), r("incorrect"), r("incorrect")], { playedAt: NOW });
    expect(lost.result.outcome).toBe("lost");
    expect(lost.proofs).toHaveLength(1);
    expect(lost.proofs[0]).toMatchObject({ levelId: "l1", page: 5, passageId: "ch_sa_2", earnedAt: NOW });
    expect(lost.result.proofIds).toEqual([lost.proofs[0].id]);
  });

  it("gives the same proof the same id on every play", () => {
    const proof = { conceptId: "c1", quote: "A quote of some length.", page: null, passageId: "p1" };
    const a = scoreLevel(say, [r("correct", { proof })], { playedAt: NOW }).proofs[0].id;
    const b = scoreLevel({ ...say, id: "other" }, [r("correct", { proof })], { playedAt: "2026-10-01T00:00:00.000Z" }).proofs[0].id;
    expect(a).toBe(b);
  });

  it("tracks missed and cleared concepts in play order, the last decisive round winning", () => {
    const { result } = scoreLevel({ ...say, rounds: 5 }, [
      r("incorrect", { conceptId: "a" }),
      r("correct", { conceptId: "b" }),
      r("correct", { conceptId: "a" }),
      r("bluff_missed", { conceptId: "b" }),
      r("partial", { conceptId: "c" }),
    ], { playedAt: NOW });
    expect(result.missedConceptIds).toEqual(["b"]);
    expect(result.clearedConceptIds).toEqual(["a"]);
  });

  it("sums the time of the rounds", () => {
    const { result } = scoreLevel(say, [r("correct", { ms: 1500 }), r("correct", { ms: 2500 })], { playedAt: NOW });
    expect(result.ms).toBe(4000);
  });

  it("a finished level ignores late reports", () => {
    let run = startLevel({ ...say, rounds: 1 });
    run = applyRound(run, r("correct")).run;
    expect(run.status).toBe("won");
    const again = applyRound(run, r("correct"));
    expect(again.run).toBe(run);
    expect(again.delta.xpGained).toBe(0);
    expect(finishLevel(run, { playedAt: NOW }).result.xp).toBe(100);
  });

  it("bounds the XP a level can pay", () => {
    const best = scoreLevel({ ...boss, rounds: 8 }, Array.from({ length: 8 }, () => r("bluff_caught", { grounded: true })), { playedAt: NOW });
    expect(best.result.xp).toBe(maxXpForLevel({ kind: "boss", rounds: 8 }));
    const ordinary = scoreLevel({ ...say, rounds: 3 }, Array.from({ length: 3 }, () => r("bluff_caught", { grounded: true })), { playedAt: NOW });
    expect(ordinary.result.xp).toBe(maxXpForLevel({ kind: "say", rounds: 3 }));
  });
});

describe("rank", () => {
  it("starts at rank 1 with 0 XP and reaches rank 2 at exactly 300", () => {
    expect(rankForXp(0)).toBe(1);
    expect(rankForXp(299)).toBe(1);
    expect(rankForXp(300)).toBe(2);
    expect(xpForRank(2)).toBe(300);
  });

  it("makes each rank step about 8 percent bigger than the one before", () => {
    for (let rank = 2; rank < 30; rank++) {
      const step = xpForRank(rank + 1) - xpForRank(rank);
      const prev = xpForRank(rank) - xpForRank(rank - 1);
      expect(step / prev).toBeGreaterThan(1.07);
      expect(step / prev).toBeLessThan(1.09);
    }
  });

  it("is monotone, capped at 30 and safe on odd input", () => {
    let last = -1;
    for (let rank = 1; rank <= 30; rank++) {
      expect(xpForRank(rank)).toBeGreaterThan(last);
      last = xpForRank(rank);
    }
    expect(rankForXp(1e12)).toBe(30);
    expect(rankForXp(-5)).toBe(1);
    expect(rankForXp(Number.NaN)).toBe(1);
    expect(xpForRank(99)).toBe(xpForRank(30));
  });

  it("reports progress inside the rank", () => {
    expect(rankProgress(0)).toMatchObject({ rank: 1, xpIntoRank: 0, xpForNext: 300, fraction: 0 });
    expect(rankProgress(150).fraction).toBeCloseTo(0.5, 5);
    expect(rankProgress(300)).toMatchObject({ rank: 2, xpIntoRank: 0 });
    expect(rankProgress(1e9)).toMatchObject({ rank: 30, xpForNext: null, fraction: 1 });
  });
});

describe("unlock", () => {
  const levels = Array.from({ length: 6 }, (_, i) => ({ id: `l${i + 1}`, index: i + 1 }));
  const stars = (...s: (0 | 1 | 2 | 3)[]) => Object.fromEntries(s.map((n, i) => [`l${i + 1}`, { stars: n }]));

  it("opens level 1 with nothing played", () => {
    expect(unlockedIndexFor(levels, {})).toBe(1);
  });

  it("needs 1 star to open the next level, in order", () => {
    expect(unlockedIndexFor(levels, stars(1))).toBe(2);
    expect(unlockedIndexFor(levels, stars(3, 2))).toBe(3);
    expect(unlockedIndexFor(levels, stars(0))).toBe(1);
  });

  it("stops at the first level without a star even when later ones have stars", () => {
    expect(unlockedIndexFor(levels, { l1: { stars: 3 }, l3: { stars: 3 } })).toBe(2);
  });

  it("caps at the last level", () => {
    expect(unlockedIndexFor(levels, stars(1, 1, 1, 1, 1, 1))).toBe(6);
  });

  it("answers isLevelUnlocked", () => {
    expect(isLevelUnlocked(1, 1)).toBe(true);
    expect(isLevelUnlocked(2, 1)).toBe(false);
    expect(isLevelUnlocked(0, 5)).toBe(false);
  });
});
