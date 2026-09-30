import { describe, expect, it } from "vitest";
import { COURSES } from "@/lib/courses";
import {
  DAILY_GOAL_DEFAULT,
  ENDOWED_XP,
  MAX_FREEZES,
  MAX_PROOFS,
  MAX_WEAK,
  addMinutes,
  applyLevelResult,
  dailyGoalFraction,
  dayDiff,
  localDay,
  mergeProgress,
  newProgress,
  rebaseProgress,
  setDailyGoal,
  streakStatus,
  touchStreak,
  type Ctx,
} from "@/lib/game/progress";
import { generateRun } from "@/lib/game/run";
import { rankForXp } from "@/lib/game/scoring";
import type { LevelResult, ProofCard, Progress } from "@/lib/game/types";

const run = generateRun(COURSES["course_transformers_w4"]);
const L = (n: number) => run.levels[n - 1].id;

const at = (iso: string, tz = "UTC"): Ctx => ({ now: new Date(iso), tz });
const day = (d: number, h = 12) => at(`2026-09-${String(d).padStart(2, "0")}T${String(h).padStart(2, "0")}:00:00.000Z`);

function result(levelId: string, over: Partial<LevelResult> = {}): LevelResult {
  return { levelId, stars: 3, xp: 400, heartsLeft: 3, bestCombo: 4, rounds: ["correct", "correct"], proofIds: [], outcome: "won", playedAt: "2026-09-10T12:00:00.000Z", ms: 60_000, ...over };
}
const proof = (id: string, earnedAt = "2026-09-10T12:00:00.000Z"): ProofCard => ({ id, conceptId: "c_position", quote: `quote ${id}`, page: 4, passageId: "ch_pos_1", levelId: L(1), earnedAt });

describe("localDay and dayDiff", () => {
  it("names the local calendar day in the given zone", () => {
    const instant = new Date("2026-09-30T23:30:00.000Z");
    expect(localDay(instant, "UTC")).toBe("2026-09-30");
    expect(localDay(instant, "Asia/Kolkata")).toBe("2026-10-01");
    expect(localDay(instant, "America/Los_Angeles")).toBe("2026-09-30");
    expect(localDay(instant, "Pacific/Kiritimati")).toBe("2026-10-01");
    expect(localDay(new Date("2026-09-30T00:30:00.000Z"), "America/Los_Angeles")).toBe("2026-09-29");
  });

  it("falls back to UTC for a zone name Intl rejects, and defaults to UTC", () => {
    const instant = new Date("2026-09-30T23:30:00.000Z");
    expect(localDay(instant, "Not/AZone")).toBe("2026-09-30");
    expect(localDay(instant)).toBe("2026-09-30");
  });

  it("keeps two plays 23 hours apart on consecutive days across a spring-forward change", () => {
    // Los Angeles moved to daylight time on 2026-03-08 at 02:00.
    expect(localDay(new Date("2026-03-08T07:30:00.000Z"), "America/Los_Angeles")).toBe("2026-03-07");
    expect(localDay(new Date("2026-03-09T06:30:00.000Z"), "America/Los_Angeles")).toBe("2026-03-08");
  });

  it("counts whole days across month, year and leap boundaries", () => {
    expect(dayDiff("2026-09-30", "2026-10-01")).toBe(1);
    expect(dayDiff("2026-12-31", "2027-01-01")).toBe(1);
    expect(dayDiff("2028-02-28", "2028-03-01")).toBe(2);
    expect(dayDiff("2026-09-30", "2026-09-28")).toBe(-2);
    expect(dayDiff("2026-09-30", "2026-09-30")).toBe(0);
  });
});

describe("newProgress", () => {
  it("starts endowed with level 1 open and the default goal", () => {
    const p = newProgress(run.id, day(10));
    expect(p.xp).toBe(ENDOWED_XP);
    expect(p.rank).toBe(1);
    expect(p.unlockedIndex).toBe(1);
    expect(p.streakDays).toBe(0);
    expect(p.lastPlayedDay).toBeNull();
    expect(p.dailyGoalMinutes).toBe(DAILY_GOAL_DEFAULT);
    expect(p.todayDay).toBe("2026-09-10");
    expect(p.results).toEqual({});
  });
});

describe("streak", () => {
  const start = (c: Ctx, freezes = 0): Progress => ({ ...newProgress(run.id, c), freezes });

  it("starts at 1 on the first won level and does not grow twice on one day", () => {
    let p = touchStreak(start(day(10)), day(10));
    expect(p.streakDays).toBe(1);
    expect(p.lastPlayedDay).toBe("2026-09-10");
    const again = touchStreak(p, day(10, 20));
    expect(again).toBe(p);
    p = touchStreak(p, day(11));
    expect(p.streakDays).toBe(2);
  });

  it("breaks after a missed day with no freeze and restarts at 1", () => {
    let p = touchStreak(start(day(10)), day(10));
    p = touchStreak(p, day(11));
    p = touchStreak(p, day(13));
    expect(p.streakDays).toBe(1);
    expect(p.lastPlayedDay).toBe("2026-09-13");
  });

  it("spends one freeze to cover one missed day and keeps the streak", () => {
    let p = { ...touchStreak(start(day(10), 1), day(10)), freezes: 1 };
    p = touchStreak(p, day(11));
    p = touchStreak(p, day(13));
    expect(p.streakDays).toBe(3);
    expect(p.freezes).toBe(0);
  });

  it("needs a freeze per missed day and spends none when it cannot cover them all", () => {
    let p = { ...touchStreak(start(day(10)), day(10)), freezes: 1, streakDays: 5 };
    const broken = touchStreak(p, day(13));
    expect(broken.streakDays).toBe(1);
    expect(broken.freezes).toBe(1);
    p = { ...p, freezes: 2 };
    const held = touchStreak(p, day(13));
    expect(held.streakDays).toBe(6);
    expect(held.freezes).toBe(0);
  });

  it("earns a freeze at each multiple of 7 and caps at 2", () => {
    let p = touchStreak(start(day(1)), day(1));
    for (let d = 2; d <= 7; d++) p = touchStreak(p, day(d));
    expect(p.streakDays).toBe(7);
    expect(p.freezes).toBe(1);
    for (let d = 8; d <= 14; d++) p = touchStreak(p, day(d));
    expect(p.streakDays).toBe(14);
    expect(p.freezes).toBe(2);
    for (let d = 15; d <= 21; d++) p = touchStreak(p, day(d));
    expect(p.streakDays).toBe(21);
    expect(p.freezes).toBe(MAX_FREEZES);
  });

  it("does not earn a freeze by spending one to reach a multiple of 7 twice", () => {
    let p = { ...touchStreak(start(day(1)), day(1)), streakDays: 6, freezes: 1 };
    p = { ...p, lastPlayedDay: "2026-09-01" };
    p = touchStreak(p, day(3));
    expect(p.streakDays).toBe(7);
    expect(p.freezes).toBe(1);
  });

  it("ignores a clock that runs backwards", () => {
    const p = touchStreak(start(day(10)), day(10));
    const later = touchStreak(p, day(11));
    const back = touchStreak(later, day(9));
    expect(back).toBe(later);
    expect(back.lastPlayedDay).toBe("2026-09-11");
  });

  it("uses the player's local day, so 23:30 then 00:30 local are consecutive days an hour apart", () => {
    const tz = "America/New_York";
    let p = start(at("2026-09-10T12:00:00Z", tz));
    p = touchStreak(p, at("2026-09-11T03:30:00Z", tz)); // 23:30 on the 10th in New York
    expect(p.lastPlayedDay).toBe("2026-09-10");
    p = touchStreak(p, at("2026-09-11T04:30:00Z", tz)); // 00:30 on the 11th
    expect(p.lastPlayedDay).toBe("2026-09-11");
    expect(p.streakDays).toBe(2);
  });

  it("keeps 00:10 and 23:50 on one local day as a single day", () => {
    const tz = "Asia/Kolkata";
    let p = start(at("2026-09-10T12:00:00Z", tz));
    p = touchStreak(p, at("2026-09-09T18:40:00Z", tz)); // 00:10 on the 10th in India
    p = touchStreak(p, at("2026-09-10T18:20:00Z", tz)); // 23:50 on the 10th
    expect(p.streakDays).toBe(1);
  });

  it("reports the state the screen needs", () => {
    const fresh = start(day(10));
    expect(streakStatus(fresh, day(10))).toMatchObject({ state: "none", days: 0 });
    let p = touchStreak(fresh, day(10));
    p = touchStreak(p, day(11));
    expect(streakStatus(p, day(11))).toMatchObject({ state: "safe", days: 2, playedToday: true });
    expect(streakStatus(p, day(12))).toMatchObject({ state: "at_risk", days: 2, playedToday: false });
    expect(streakStatus(p, day(13))).toMatchObject({ state: "broken", days: 0, missedDays: 1, freezesNeeded: 1 });
    const frozen = { ...p, freezes: 1 };
    expect(streakStatus(frozen, day(13))).toMatchObject({ state: "at_risk", days: 2, freezesNeeded: 1, freezes: 1 });
    expect(streakStatus(frozen, day(14))).toMatchObject({ state: "broken", days: 0, missedDays: 2 });
    expect(streakStatus(p, day(9))).toMatchObject({ state: "safe" });
  });
});

describe("daily goal", () => {
  it("fills as minutes are added and resets on a new local day", () => {
    let p = newProgress(run.id, day(10));
    p = addMinutes(p, 4, day(10));
    expect(p.todayMinutes).toBe(4);
    expect(dailyGoalFraction(p, day(10))).toBeCloseTo(0.4, 5);
    p = addMinutes(p, 30, day(10, 20));
    expect(dailyGoalFraction(p, day(10, 20))).toBe(1);
    expect(dailyGoalFraction(p, day(11))).toBe(0);
    p = addMinutes(p, 2, day(11));
    expect(p.todayMinutes).toBe(2);
    expect(p.todayDay).toBe("2026-09-11");
  });

  it("ignores negative and non finite minutes and clamps the goal", () => {
    let p = newProgress(run.id, day(10));
    p = addMinutes(addMinutes(addMinutes(p, -5, day(10)), Number.NaN, day(10)), Number.POSITIVE_INFINITY, day(10));
    expect(p.todayMinutes).toBe(0);
    expect(setDailyGoal(p, 0, day(10)).dailyGoalMinutes).toBe(1);
    expect(setDailyGoal(p, 9999, day(10)).dailyGoalMinutes).toBe(120);
    expect(setDailyGoal(p, 25.4, day(10)).dailyGoalMinutes).toBe(25);
    expect(setDailyGoal(p, Number.NaN, day(10)).dailyGoalMinutes).toBe(DAILY_GOAL_DEFAULT);
  });
});

describe("applyLevelResult", () => {
  const ctx = day(10);
  const fresh = () => newProgress(run.id, ctx);

  it("pays XP, sets the rank, opens the next level and starts the streak and the ring", () => {
    const p = applyLevelResult(fresh(), run, result(L(1), { xp: 300, ms: 120_000 }), [proof("p1")], ctx);
    expect(p.xp).toBe(ENDOWED_XP + 300);
    expect(p.rank).toBe(rankForXp(ENDOWED_XP + 300));
    expect(p.rank).toBe(2);
    expect(p.unlockedIndex).toBe(2);
    expect(p.streakDays).toBe(1);
    expect(p.todayMinutes).toBe(2);
    expect(p.proofs.map((c) => c.id)).toEqual(["p1"]);
    expect(p.results[L(1)].stars).toBe(3);
    expect(p.updatedAt).toBe(ctx.now.toISOString());
  });

  it("is idempotent on the same level and time", () => {
    const once = applyLevelResult(fresh(), run, result(L(1)), [proof("p1")], ctx);
    expect(applyLevelResult(once, run, result(L(1)), [proof("p1")], ctx)).toBe(once);
  });

  it("does not open the next level for a result with 0 stars", () => {
    const p = applyLevelResult(fresh(), run, result(L(1), { stars: 0, xp: 0, outcome: "lost", heartsLeft: 0 }), [], ctx);
    expect(p.unlockedIndex).toBe(1);
    expect(p.streakDays).toBe(0);
    expect(p.results[L(1)].stars).toBe(0);
    expect(p.todayMinutes).toBe(1);
  });

  it("keeps the better play of a level and pays only the XP above the best on a replay", () => {
    let p = applyLevelResult(fresh(), run, result(L(1), { stars: 2, xp: 300 }), [], ctx);
    p = applyLevelResult(p, run, result(L(1), { stars: 3, xp: 350, playedAt: "2026-09-10T13:00:00.000Z" }), [], ctx);
    expect(p.xp).toBe(ENDOWED_XP + 350);
    expect(p.results[L(1)].stars).toBe(3);
    p = applyLevelResult(p, run, result(L(1), { stars: 1, xp: 100, playedAt: "2026-09-10T14:00:00.000Z" }), [], ctx);
    expect(p.xp).toBe(ENDOWED_XP + 350);
    expect(p.results[L(1)].stars).toBe(3);
    expect(p.results[L(1)].xp).toBe(350);
  });

  it("never re-pays XP already paid when a better-starred play carries less XP", () => {
    let p = applyLevelResult(fresh(), run, result(L(1), { stars: 2, xp: 400 }), [], ctx);
    p = applyLevelResult(p, run, result(L(1), { stars: 3, xp: 250, playedAt: "2026-09-10T13:00:00.000Z" }), [], ctx);
    expect(p.xp).toBe(ENDOWED_XP + 400);
    p = applyLevelResult(p, run, result(L(1), { stars: 3, xp: 380, playedAt: "2026-09-10T14:00:00.000Z" }), [], ctx);
    expect(p.xp).toBe(ENDOWED_XP + 400);
  });

  it("unlocks in order, one level per starred level", () => {
    let p = fresh();
    for (let i = 1; i <= 3; i++) p = applyLevelResult(p, run, result(L(i), { playedAt: `2026-09-10T1${i}:00:00.000Z` }), [], ctx);
    expect(p.unlockedIndex).toBe(4);
    const skipped = applyLevelResult(fresh(), run, result(L(3)), [], ctx);
    expect(skipped.unlockedIndex).toBe(1);
  });

  it("adds missed concepts to the weak list and redeems them when answered right later", () => {
    let p = applyLevelResult(fresh(), run, result(L(1), { missedConceptIds: ["c_position", "c_qkv"], clearedConceptIds: [] }), [], ctx);
    expect(p.weakConceptIds).toEqual(["c_position", "c_qkv"]);
    p = applyLevelResult(p, run, result(L(2), { missedConceptIds: ["c_backprop"], clearedConceptIds: ["c_position"] }), [], ctx);
    expect(p.weakConceptIds).toEqual(["c_qkv", "c_backprop"]);
    p = applyLevelResult(p, run, result(L(1), { missedConceptIds: ["c_qkv"], playedAt: "2026-09-10T15:00:00.000Z" }), [], ctx);
    expect(p.weakConceptIds).toEqual(["c_qkv", "c_backprop"]);
  });

  it("caps the weak list and the proof shelf", () => {
    const many = Array.from({ length: 30 }, (_, i) => `c${i}`);
    let p = applyLevelResult(fresh(), run, result(L(1), { missedConceptIds: many }), [], ctx);
    expect(p.weakConceptIds).toHaveLength(MAX_WEAK);
    expect(p.weakConceptIds.at(-1)).toBe("c29");
    const cards = Array.from({ length: MAX_PROOFS + 20 }, (_, i) => proof(`p${i}`));
    p = applyLevelResult(p, run, result(L(2)), cards, ctx);
    expect(p.proofs).toHaveLength(MAX_PROOFS);
    expect(p.proofs.at(-1)?.id).toBe(`p${MAX_PROOFS + 19}`);
  });

  it("dedupes proof cards by id", () => {
    let p = applyLevelResult(fresh(), run, result(L(1)), [proof("p1"), proof("p1")], ctx);
    p = applyLevelResult(p, run, result(L(2), { playedAt: "2026-09-10T13:00:00.000Z" }), [proof("p1"), proof("p2")], ctx);
    expect(p.proofs.map((c) => c.id)).toEqual(["p1", "p2"]);
  });

  it("ignores a result for a level that is not in the run", () => {
    const p = fresh();
    expect(applyLevelResult(p, run, result("l_missing"), [], ctx)).toBe(p);
  });

  it("does not mutate its input", () => {
    const p = fresh();
    const before = JSON.stringify(p);
    applyLevelResult(p, run, result(L(1)), [proof("p1")], ctx);
    expect(JSON.stringify(p)).toBe(before);
  });

  it("carries a streak across days through real applications", () => {
    let p = fresh();
    p = applyLevelResult(p, run, result(L(1), { playedAt: "2026-09-10T12:00:00.000Z" }), [], day(10));
    p = applyLevelResult(p, run, result(L(2), { playedAt: "2026-09-11T12:00:00.000Z" }), [], day(11));
    p = applyLevelResult(p, run, result(L(3), { playedAt: "2026-09-13T12:00:00.000Z" }), [], day(13));
    expect(p.streakDays).toBe(1);
    expect(p.todayMinutes).toBe(1);
    expect(p.todayDay).toBe("2026-09-13");
  });
});

describe("mergeProgress", () => {
  const ctxA = day(10);
  const base = () => newProgress(run.id, ctxA);

  it("keeps everything either device earned", () => {
    const a = applyLevelResult(base(), run, result(L(1), { xp: 300 }), [proof("pa", "2026-09-10T12:00:00.000Z")], day(10));
    const b = applyLevelResult(base(), run, result(L(2), { xp: 200, playedAt: "2026-09-10T13:00:00.000Z" }), [proof("pb", "2026-09-10T13:00:00.000Z")], day(10, 13));
    const m = mergeProgress(a, b, run);
    expect(Object.keys(m.results).sort()).toEqual([L(1), L(2)].sort());
    expect(m.xp).toBe(ENDOWED_XP + 300 + 200);
    expect(m.rank).toBe(rankForXp(m.xp));
    expect(m.proofs.map((c) => c.id)).toEqual(["pa", "pb"]);
    expect(m.unlockedIndex).toBe(3);
  });

  it("is idempotent and order independent", () => {
    const a = applyLevelResult(base(), run, result(L(1), { xp: 300, missedConceptIds: ["c_qkv"] }), [proof("pa")], day(10));
    const b = applyLevelResult(applyLevelResult(base(), run, result(L(1), { xp: 100, stars: 1 }), [], day(11)), run, result(L(2), { xp: 200, playedAt: "2026-09-11T13:00:00.000Z", missedConceptIds: ["c_position"] }), [proof("pb", "2026-09-11T13:00:00.000Z")], day(11, 13));
    expect(mergeProgress(a, a, run)).toEqual(a);
    expect(mergeProgress(a, b, run)).toEqual(mergeProgress(b, a, run));
    const m = mergeProgress(a, b, run);
    expect(mergeProgress(m, a, run)).toEqual(m);
    expect(mergeProgress(m, b, run)).toEqual(m);
  });

  it("never lowers XP and takes the better result of a level played on both", () => {
    const a = applyLevelResult(base(), run, result(L(1), { stars: 3, xp: 400 }), [], day(10));
    const b = applyLevelResult(base(), run, result(L(1), { stars: 1, xp: 120, playedAt: "2026-09-12T12:00:00.000Z" }), [], day(12));
    const m = mergeProgress(a, b, run);
    expect(m.results[L(1)].stars).toBe(3);
    expect(m.xp).toBeGreaterThanOrEqual(Math.max(a.xp, b.xp));
    expect(m.xp).toBe(ENDOWED_XP + 400);
  });

  it("follows the copy that played last for the streak", () => {
    let a = applyLevelResult(base(), run, result(L(1)), [], day(10));
    a = applyLevelResult(a, run, result(L(2), { playedAt: "2026-09-11T12:00:00.000Z" }), [], day(11));
    const b = applyLevelResult(base(), run, result(L(3), { playedAt: "2026-09-12T12:00:00.000Z" }), [], day(12));
    const m = mergeProgress(a, b, run);
    expect(m.lastPlayedDay).toBe("2026-09-12");
    expect(m.streakDays).toBe(b.streakDays);
  });

  it("takes the lower freeze count when both copies played the same day, so a freeze is not spent twice for free", () => {
    const a = { ...applyLevelResult(base(), run, result(L(1)), [], day(10)), freezes: 2 };
    const b = { ...applyLevelResult(base(), run, result(L(2)), [], day(10)), freezes: 1 };
    expect(mergeProgress(a, b).freezes).toBe(1);
  });

  it("unions weak concepts but drops ones the newer copy cleared", () => {
    const a = applyLevelResult(base(), run, result(L(1), { missedConceptIds: ["c_qkv", "c_position"] }), [], day(10));
    const b = applyLevelResult(base(), run, result(L(2), { missedConceptIds: ["c_backprop"], clearedConceptIds: ["c_qkv"], playedAt: "2026-09-11T12:00:00.000Z" }), [], day(11));
    const m = mergeProgress(a, b, run);
    expect(m.weakConceptIds.sort()).toEqual(["c_backprop", "c_position"]);
  });

  it("keeps the larger daily minutes on the same day and the later day's minutes otherwise", () => {
    const a = addMinutes(base(), 3, day(10));
    const b = addMinutes(base(), 8, day(10));
    expect(mergeProgress(a, b).todayMinutes).toBe(8);
    const c = addMinutes(base(), 2, day(11));
    const m = mergeProgress(a, c);
    expect(m.todayDay).toBe("2026-09-11");
    expect(m.todayMinutes).toBe(2);
  });

  it("rebases the unlock frontier against the current run", () => {
    let a = base();
    for (let i = 1; i <= 3; i++) a = applyLevelResult(a, run, result(L(i), { playedAt: `2026-09-10T1${i}:00:00.000Z` }), [], day(10));
    expect(rebaseProgress({ ...a, unlockedIndex: 99 }, run).unlockedIndex).toBe(4);
    expect(mergeProgress(a, base(), run).unlockedIndex).toBe(4);
  });

  it("caps merged proofs and weak concepts", () => {
    const a = applyLevelResult(base(), run, result(L(1), { missedConceptIds: Array.from({ length: 12 }, (_, i) => `a${i}`) }), Array.from({ length: MAX_PROOFS }, (_, i) => proof(`a${i}`)), day(10));
    const b = applyLevelResult(base(), run, result(L(2), { missedConceptIds: Array.from({ length: 12 }, (_, i) => `b${i}`), playedAt: "2026-09-11T12:00:00.000Z" }), Array.from({ length: MAX_PROOFS }, (_, i) => proof(`b${i}`, "2026-09-11T12:00:00.000Z")), day(11));
    const m = mergeProgress(a, b);
    expect(m.proofs).toHaveLength(MAX_PROOFS);
    expect(m.weakConceptIds.length).toBeLessThanOrEqual(MAX_WEAK);
  });
});
