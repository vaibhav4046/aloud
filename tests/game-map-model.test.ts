import { describe, expect, it } from "vitest";
import { currentLevel, dailyRing, flameState, layoutMap, nodeLabel, nodeState, worldSummary } from "../src/components/game/map-model";
import { fixtureProgress, fixtureRun, won } from "./game-fixture";

describe("map node states", () => {
  const run = fixtureRun();

  it("a fresh run has level 1 current and everything else locked", () => {
    const p = fixtureProgress();
    expect(currentLevel(run, p)?.id).toBe("lv_1");
    expect(nodeState(run.levels[0], run, p)).toBe("current");
    expect(nodeState(run.levels[1], run, p)).toBe("locked");
  });

  it("winning a level moves the current node to the next unlocked one", () => {
    const p = fixtureProgress({ unlockedIndex: 2, results: { lv_1: won("lv_1", 2) } });
    expect(nodeState(run.levels[0], run, p)).toBe("done");
    expect(nodeState(run.levels[1], run, p)).toBe("current");
    expect(currentLevel(run, p)?.id).toBe("lv_2");
  });

  it("a lost level does not unlock anything and is not done", () => {
    const lost = { ...won("lv_1", 1), stars: 0 as const, outcome: "lost" as const };
    const p = fixtureProgress({ results: { lv_1: lost } });
    expect(nodeState(run.levels[0], run, p)).toBe("current");
  });

  it("returns null current when every level is won", () => {
    const results = Object.fromEntries(run.levels.map((l) => [l.id, won(l.id, 3)]));
    const p = fixtureProgress({ unlockedIndex: 12, results });
    expect(currentLevel(run, p)).toBeNull();
  });

  it("names a locked node without leaking anything but its number and kind", () => {
    const layout = layoutMap(run, fixtureProgress());
    const label = nodeLabel(layout.nodes[3]);
    expect(label).toMatch(/Level 4, Boss/);
    expect(label).toMatch(/Locked/);
  });
});

describe("world summaries (goal gradient)", () => {
  const run = fixtureRun();

  it("says how many levels a world has before any are won", () => {
    expect(worldSummary(run.worlds[0], run, fixtureProgress()).copy).toBe("4 levels");
  });

  it("switches to the near-end look from 60 percent and counts down", () => {
    const results = { lv_1: won("lv_1", 3), lv_2: won("lv_2", 3), lv_3: won("lv_3", 3) };
    const s = worldSummary(run.worlds[0], run, fixtureProgress({ unlockedIndex: 4, results }));
    expect(s.nearEnd).toBe(true);
    expect(s.bossOpen).toBe(true);
    expect(s.copy).toBe("The boss is open");
  });

  it("reports a cleared world", () => {
    const results = Object.fromEntries(run.worlds[0].levelIds.map((id) => [id, won(id, 1)]));
    const s = worldSummary(run.worlds[0], run, fixtureProgress({ unlockedIndex: 5, results }));
    expect(s.copy).toBe("World cleared");
    expect(s.fraction).toBe(1);
  });
});

describe("map layout", () => {
  const run = fixtureRun();

  it("places one node per level, centres bosses, and keeps x inside the map", () => {
    const layout = layoutMap(run, fixtureProgress());
    expect(layout.nodes).toHaveLength(12);
    expect(layout.banners).toHaveLength(3);
    for (const n of layout.nodes) {
      expect(n.x).toBeGreaterThan(10);
      expect(n.x).toBeLessThan(90);
      if (n.level.kind === "boss") expect(n.x).toBe(50);
    }
    const ys = layout.nodes.map((n) => n.y);
    expect([...ys].sort((a, b) => a - b)).toEqual(ys);
    expect(layout.height).toBeGreaterThan(ys[ys.length - 1]);
  });

  it("splits the road at the current node", () => {
    const p = fixtureProgress({ unlockedIndex: 3, results: { lv_1: won("lv_1", 3), lv_2: won("lv_2", 3) } });
    const layout = layoutMap(run, p);
    expect(layout.currentId).toBe("lv_3");
    expect(layout.pathDone.startsWith("M")).toBe(true);
    expect(layout.pathTodo.startsWith("M")).toBe(true);
    expect((layout.pathDone.match(/C/g) ?? []).length).toBe(2);
  });
});

describe("streak flame and daily ring", () => {
  const ctx = { now: new Date("2026-09-30T12:00:00Z"), tz: "UTC" };

  it("is lit only when a level was finished today", () => {
    expect(flameState(fixtureProgress({ streakDays: 3, lastPlayedDay: "2026-09-30" }), ctx)).toMatchObject({ lit: true, days: 3, state: "safe" });
    const f = flameState(fixtureProgress({ streakDays: 3, lastPlayedDay: "2026-09-29" }), ctx);
    expect(f.lit).toBe(false);
    expect(f.state).toBe("at_risk");
    expect(f.copy).toMatch(/play today/);
  });

  it("uses no guilt copy for a zero or broken streak", () => {
    expect(flameState(fixtureProgress(), ctx).copy).toBe("Start a streak");
    const broken = flameState(fixtureProgress({ streakDays: 9, lastPlayedDay: "2026-09-20" }), ctx);
    expect(broken).toMatchObject({ days: 0, state: "broken", copy: "Start a streak" });
  });

  it("keeps a streak alive across a missed day when a freeze covers it", () => {
    const f = flameState(fixtureProgress({ streakDays: 8, freezes: 1, lastPlayedDay: "2026-09-28" }), ctx);
    expect(f).toMatchObject({ days: 8, state: "at_risk" });
    expect(f.freezeCopy).toBe("1 freeze banked");
  });

  it("caps the ring at 1, reports goal met, and counts only minutes from today", () => {
    const met = dailyRing(fixtureProgress({ todayMinutes: 14, dailyGoalMinutes: 10, todayDay: "2026-09-30" }), ctx);
    expect(met.fraction).toBe(1);
    expect(met.met).toBe(true);
    expect(dailyRing(fixtureProgress({ todayMinutes: 4.6, todayDay: "2026-09-30" }), ctx).copy).toBe("4 of 10 min");
    expect(dailyRing(fixtureProgress({ todayMinutes: 9, todayDay: "2026-09-29" }), ctx).fraction).toBe(0);
  });
});
