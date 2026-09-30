import { describe, expect, it } from "vitest";
import { COURSES } from "@/lib/courses";
import { generateRun } from "@/lib/game/run";
import { applyRound, finishLevel, heartsForLevel, startLevel } from "@/lib/game/scoring";
import type { Level, RoundOutcome } from "@/lib/game/types";
import { notesSubject } from "./game-notes-fixture";

/**
 * A level has to be losable. Two rounds with three hearts meant a player who
 * missed both still won the level and kept a star, because the hearts never ran
 * out before the rounds did.
 */

function play(level: Level, outcome: RoundOutcome) {
  let run = startLevel(level);
  for (let i = 0; i < level.rounds && run.status === "playing"; i++) {
    run = applyRound(run, { conceptId: level.conceptIds[0], outcome, grounded: false, ms: 1000 }).run;
  }
  return run;
}

const missOf = (level: Level): RoundOutcome => (level.kind === "catch" ? "bluff_missed" : "incorrect");

describe("heartsForLevel", () => {
  it("never gives as many hearts as rounds outside a boss, and keeps the boss at four when it has the rounds", () => {
    expect(heartsForLevel("say", 2)).toBe(1);
    expect(heartsForLevel("catch", 3)).toBe(2);
    expect(heartsForLevel("say", 4)).toBe(3);
    expect(heartsForLevel("recall", 6)).toBe(3);
    expect(heartsForLevel("boss", 6)).toBe(4);
    expect(heartsForLevel("boss", 4)).toBe(4);
    expect(heartsForLevel("boss", 3)).toBe(3);
  });
});

describe("a level answered all wrong is lost", () => {
  const ids = Object.keys(COURSES);

  it("covers all 26 shipped subjects", () => {
    expect(ids.length).toBe(26);
  });

  it.each(ids)("%s: every level ends lost, with no stars and no XP", (id) => {
    const run = generateRun(COURSES[id] as never, { now: "2026-09-30T00:00:00.000Z" });
    for (const level of run.levels) {
      const played = play(level, missOf(level));
      expect(played.status, `${level.id} (${level.kind}, ${level.rounds} rounds, ${level.hearts} hearts)`).toBe("lost");
      const { result } = finishLevel(played, { playedAt: "t" });
      expect(result).toMatchObject({ outcome: "lost", stars: 0, xp: 0 });
    }
  });

  it("holds for a level list from uploaded notes too", async () => {
    const run = generateRun(await notesSubject("u1"), { now: "2026-09-30T00:00:00.000Z" });
    for (const level of run.levels) expect(play(level, missOf(level)).status, level.id).toBe("lost");
  });

  it("and a level answered all right is still won with its hearts intact", () => {
    const run = generateRun(COURSES[ids[0]] as never, { now: "2026-09-30T00:00:00.000Z" });
    for (const level of run.levels) {
      const played = play(level, level.kind === "catch" ? "bluff_caught" : "correct");
      expect(played.status).toBe("won");
      expect(played.hearts).toBe(level.hearts);
    }
  });
});

describe("a run stored before the rule", () => {
  it("is given the current hearts when it is loaded", async () => {
    const { promises: fs } = await import("fs");
    const os = await import("os");
    const path = await import("path");
    const { FileEventStore } = await import("@/lib/store/file");
    const { loadRun, runKey } = await import("@/lib/game/service");
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "aloud-hearts-"));
    process.env.DATA_DIR = tmp;
    try {
      const store = new FileEventStore();
      const subject = await notesSubject("u_hearts");
      const fresh = generateRun(subject, { now: "2026-09-30T00:00:00.000Z" });
      const old = { ...fresh, levels: fresh.levels.map((l) => ({ ...l, hearts: l.kind === "boss" ? 4 : 3 })) };
      await store.putGameDoc("u_hearts", runKey(subject.id), old);
      const { run } = await loadRun(store, "u_hearts", subject, { now: new Date() });
      expect(run.levels.map((l) => l.hearts)).toEqual(fresh.levels.map((l) => l.hearts));
      expect(run.levels.some((l) => l.hearts !== 3 && l.kind !== "boss")).toBe(true);
    } finally {
      delete process.env.DATA_DIR;
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});
