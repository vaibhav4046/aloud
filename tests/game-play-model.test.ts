import { describe, expect, it } from "vitest";
import { comboView, initialPlay, playReducer, type PlayAction, type PlayState } from "../src/components/game/play-model";
import { applyResult, comboMultiplier, finishLevel, rankInfo, starsFor } from "../src/components/game/engine-port";
import { burstParticles, countUp, rollCrate, seededRandom } from "../src/components/game/result-model";
import { fixtureProgress, fixtureRun } from "./game-fixture";
import type { RoundReport } from "../src/lib/game/types";

const run = fixtureRun();
const ctx = { now: new Date("2026-09-30T12:00:00Z"), tz: "UTC" };
const sayLevel = run.levels[0];
const boss = run.levels[3];

const rep = (outcome: RoundReport["outcome"], grounded = false, proof = false): RoundReport => ({
  conceptId: "c1",
  outcome,
  grounded,
  ms: 4000,
  ...(proof ? { proof: { conceptId: "c1", quote: "Attention weights sum to one.", page: 3, passageId: "p1" } } : {}),
});

function play(level: typeof sayLevel, reports: RoundReport[]): PlayState {
  let s = playReducer(initialPlay(level), { type: "start" });
  reports.forEach((r, i) => {
    void i;
    const a: PlayAction = { type: "round", report: r, now: "2026-09-30T00:00:00.000Z" };
    s = playReducer(s, a);
  });
  return s;
}

describe("level flow", () => {
  it("does nothing until started", () => {
    const s = playReducer(initialPlay(sayLevel), { type: "round", report: rep("correct"), now: "t" });
    expect(s.phase).toBe("ready");
    expect(s.roundIndex).toBe(0);
  });

  it("wins after the last round with hearts left", () => {
    const s = play(sayLevel, [rep("correct"), rep("correct"), rep("correct"), rep("correct")]);
    expect(s.phase).toBe("won");
    expect(s.run.hearts).toBe(3);
    expect(s.run.status).toBe("won");
  });

  it("a wrong answer costs a heart and breaks the combo", () => {
    const s = play(sayLevel, [rep("correct"), rep("correct"), rep("incorrect")]);
    expect(s.run.hearts).toBe(2);
    expect(s.run.combo).toBe(0);
    expect(s.run.bestCombo).toBe(2);
    expect(s.last?.heartLost).toBe(true);
  });

  it("zero hearts loses the level before the last round", () => {
    const s = play(sayLevel, [rep("incorrect"), rep("bluff_missed"), rep("incorrect")]);
    expect(s.phase).toBe("lost");
    expect(s.run.hearts).toBe(0);
    expect(s.roundIndex).toBe(3);
  });

  it("a boss has 4 hearts and survives 3 misses", () => {
    const s = play(boss, [rep("incorrect"), rep("incorrect"), rep("incorrect")]);
    expect(s.run.hearts).toBe(1);
    expect(s.phase).toBe("live");
  });

  it("ignores rounds after the level ended", () => {
    const s = play(sayLevel, [rep("correct"), rep("correct"), rep("correct"), rep("correct"), rep("incorrect")]);
    expect(s.roundIndex).toBe(4);
    expect(s.run.hearts).toBe(3);
  });

  it("a partial keeps the combo where it was", () => {
    const s = play(sayLevel, [rep("correct"), rep("correct"), rep("partial")]);
    expect(s.run.combo).toBe(2);
  });

  it("a hint keeps the heart, halves XP on that round only, and is single use per round", () => {
    let s = playReducer(initialPlay(sayLevel), { type: "start" });
    s = playReducer(s, { type: "hint" });
    s = playReducer(s, { type: "hint" });
    expect(s.hintsUsed).toBe(1);
    s = playReducer(s, { type: "round", report: rep("correct"), now: "t" });
    expect(s.run.xp).toBe(50);
    expect(s.hinted).toBe(false);
    s = playReducer(s, { type: "round", report: rep("correct"), now: "t" });
    expect(s.last?.xpGain).toBe(100);
    expect(s.run.hearts).toBe(3);
  });

  it("collects one proof card per verified quote and never a duplicate", () => {
    const s0 = playReducer(initialPlay(sayLevel), { type: "start" });
    const a: PlayAction = { type: "round", report: rep("correct", true, true), now: "t" };
    const s1 = playReducer(playReducer(s0, a), a);
    expect(s1.proofs).toHaveLength(1);
    expect(s1.last?.proof).toBeNull();
  });

  it("a missed round never earns a proof card", () => {
    const s = play(sayLevel, [rep("incorrect", true, true)]);
    expect(s.proofs).toHaveLength(0);
  });
});

describe("scoring seam", () => {
  it("pays the brief: 100 correct, +25 grounded, boss x1.5, combo tiers", () => {
    const one = playReducer(playReducer(initialPlay(sayLevel), { type: "start" }), { type: "round", report: rep("correct", true), now: "t" });
    expect(one.last?.xpGain).toBe(125);
    const b = playReducer(playReducer(initialPlay(boss), { type: "start" }), { type: "round", report: rep("correct"), now: "t" });
    expect(b.last?.xpGain).toBe(150);
    expect(comboMultiplier(2)).toBe(1);
    expect(comboMultiplier(3)).toBe(1.2);
    expect(comboMultiplier(5)).toBe(1.5);
    expect(comboMultiplier(8)).toBe(2);
  });

  it("stars: 3 for a clean level, 2 for one heart lost, 1 otherwise", () => {
    expect(starsFor(["correct", "correct", "partial", "correct"], "won")).toBe(3);
    expect(starsFor(["correct", "partial", "partial", "correct"], "won")).toBe(2);
    expect(starsFor(["correct", "incorrect", "correct", "correct"], "won")).toBe(2);
    expect(starsFor(["incorrect", "incorrect", "correct", "correct"], "won")).toBe(1);
    expect(starsFor(["correct"], "lost")).toBe(0);
  });

  it("rank starts at 1, first rank up at 300 XP, each step about 8 percent larger", () => {
    expect(rankInfo(0).rank).toBe(1);
    expect(rankInfo(299).rank).toBe(1);
    expect(rankInfo(300).rank).toBe(2);
    expect(rankInfo(624).rank).toBe(3);
    expect(rankInfo(10_000_000)).toMatchObject({ rank: 30, maxed: true });
    expect(rankInfo(150).fraction).toBeCloseTo(0.5, 5);
  });

  it("folds a win into progress with the engine rules: unlock, streak, xp, proofs, minutes", () => {
    const s = play(sayLevel, [rep("correct", true, true), rep("correct", true), rep("correct", true), rep("correct", true)]);
    const { result, proofs } = finishLevel(s.run, { playedAt: "2026-09-30T10:00:00.000Z" });
    expect(result.stars).toBe(3);
    const applied = applyResult(fixtureProgress(), run, { ...result, ms: 150_000 }, proofs, ctx);
    expect(applied.progress.unlockedIndex).toBe(2);
    expect(applied.unlockedNext).toBe(true);
    expect(applied.progress.streakDays).toBe(1);
    expect(applied.streakExtended).toBe(true);
    expect(applied.progress.xp).toBe(s.run.xp);
    expect(applied.rankAfter).toBeGreaterThanOrEqual(applied.rankBefore);
    expect(applied.progress.proofs).toHaveLength(1);
    expect(applied.progress.todayMinutes).toBeCloseTo(2.5, 2);
  });

  it("replaying a level pays only the improvement and playing the same result twice changes nothing", () => {
    const first = play(sayLevel, [rep("correct"), rep("correct"), rep("correct"), rep("correct")]);
    const { result } = finishLevel(first.run, { playedAt: "2026-09-30T10:00:00.000Z" });
    const once = applyResult(fixtureProgress(), run, result, [], ctx).progress;
    const twice = applyResult(once, run, result, [], ctx).progress;
    expect(twice.xp).toBe(once.xp);
    const better = { ...result, playedAt: "2026-09-30T11:00:00.000Z", xp: result.xp + 40 };
    expect(applyResult(once, run, better, [], ctx).progress.xp).toBe(once.xp + 40);
  });

  it("earns a streak freeze on day 7", () => {
    const won = finishLevel(play(sayLevel, [rep("correct"), rep("correct"), rep("correct"), rep("correct")]).run, { playedAt: "t" }).result;
    const seven = applyResult(fixtureProgress({ streakDays: 6, lastPlayedDay: "2026-09-29" }), run, won, [], ctx);
    expect(seven.progress.streakDays).toBe(7);
    expect(seven.freezeEarned).toBe(true);
    expect(seven.progress.freezes).toBe(1);
  });

  it("a lost level adds the concepts to the weak list and does not unlock", () => {
    const lost = play(sayLevel, [rep("incorrect"), rep("incorrect"), rep("incorrect")]);
    const { result } = finishLevel(lost.run, { playedAt: "t" });
    expect(result.stars).toBe(0);
    expect(result.xp).toBe(0);
    const a = applyResult(fixtureProgress(), run, result, [], ctx);
    expect(a.progress.unlockedIndex).toBe(1);
    expect(a.progress.weakConceptIds).toEqual(["c1"]);
    expect(a.progress.lastPlayedDay).toBeNull();
  });
});

describe("combo meter", () => {
  it("fills toward the next tier and tops out at x2", () => {
    expect(comboView(0)).toMatchObject({ multiplier: 1, nextAt: 3, fill: 0 });
    expect(comboView(2).fill).toBeCloseTo(2 / 3, 5);
    expect(comboView(3)).toMatchObject({ multiplier: 1.2, nextAt: 5 });
    expect(comboView(8)).toMatchObject({ multiplier: 2, nextAt: null, fill: 1 });
  });
});

describe("crate roll", () => {
  const facts = [{ quote: "Softmax turns scores into weights.", page: 4, conceptId: "c1" }];

  it("is deterministic for a seed", () => {
    const a = rollCrate({ seed: "lv_1:t", stars: 3, won: true, freezes: 0, facts });
    const b = rollCrate({ seed: "lv_1:t", stars: 3, won: true, freezes: 0, facts });
    expect(a).toEqual(b);
  });

  it("never opens for a lost level", () => {
    for (let i = 0; i < 50; i++) expect(rollCrate({ seed: `s${i}`, stars: 0, won: false, freezes: 0, facts })).toBeNull();
  });

  it("opens on roughly two levels in five, more on three stars, and covers all three kinds", () => {
    const kinds = new Set<string>();
    let opened1 = 0;
    let opened3 = 0;
    const n = 600;
    for (let i = 0; i < n; i++) {
      const c1 = rollCrate({ seed: `a${i}`, stars: 1, won: true, freezes: 0, facts });
      const c3 = rollCrate({ seed: `a${i}`, stars: 3, won: true, freezes: 0, facts });
      if (c1) { opened1++; kinds.add(c1.kind); }
      if (c3) opened3++;
    }
    expect(opened1 / n).toBeGreaterThan(0.33);
    expect(opened1 / n).toBeLessThan(0.47);
    expect(opened3 / n).toBeGreaterThan(0.53);
    expect(kinds).toEqual(new Set(["fact", "freeze", "xp"]));
  });

  it("never hands a fact it does not have, or a freeze past the cap", () => {
    for (let i = 0; i < 300; i++) {
      const c = rollCrate({ seed: `b${i}`, stars: 3, won: true, freezes: 2, facts: [] });
      if (c) expect(c.kind).toBe("xp");
    }
  });
});

describe("animation math", () => {
  it("counts up monotonically from the start value to the target", () => {
    expect(countUp(100, 500, 0)).toBe(100);
    expect(countUp(100, 500, 1)).toBe(500);
    let prev = 100;
    for (let t = 0; t <= 1; t += 0.1) {
      const v = countUp(100, 500, t);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it("bursts scale with the stars earned", () => {
    expect(burstParticles(0)).toHaveLength(0);
    expect(burstParticles(3)).toHaveLength(30);
    expect(burstParticles(2)[0]).toEqual(burstParticles(2)[0]);
  });

  it("the seeded random is stable", () => {
    expect(seededRandom("x")()).toBe(seededRandom("x")());
  });
});
