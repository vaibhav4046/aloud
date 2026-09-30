import { describe, expect, it } from "vitest";
import { COURSES } from "@/lib/courses";
import type { Course } from "@/lib/courses/types";
import { synthetic } from "./game-fixtures";
import { guardBacksBluff, guardBacksReal, sentencesOf } from "@/lib/game/claims";
import { MAX_LEVELS, MIN_LEVELS, findLevel, generateRun, withRecall } from "@/lib/game/run";
import type { CatchItem, Level, Progress, Run } from "@/lib/game/types";

const ALL = Object.values(COURSES);
const SAMPLE = COURSES["course_transformers_w4"];
const pageOf = (course: Course, passageId: string) => course.sources.flatMap((s) => s.chunks).find((c) => c.id === passageId);
const flat = (t: string) => t.replace(/\s+/g, " ");

function progress(over: Partial<Progress> = {}): Progress {
  return {
    runId: "run_x", xp: 0, rank: 1, unlockedIndex: 1, streakDays: 0, lastPlayedDay: null, freezes: 0,
    results: {}, proofs: [], weakConceptIds: [], dailyGoalMinutes: 10, todayMinutes: 0, updatedAt: "2026-09-30T00:00:00.000Z",
    ...over,
  };
}

describe("generateRun on every shipped subject", () => {
  for (const course of ALL) {
    it(`${course.id}: 12..30 levels, worlds end in a boss, difficulty ramps`, () => {
      const run = generateRun(course, { now: "2026-09-30T06:00:00.000Z" });
      expect(run.size).toBe(run.levels.length);
      expect(run.size).toBeGreaterThanOrEqual(MIN_LEVELS);
      expect(run.size).toBeLessThanOrEqual(MAX_LEVELS);
      expect(run.id).toBe(`run_${course.id}`);
      expect(run.subjectId).toBe(course.id);
      expect(run.createdAt).toBe("2026-09-30T06:00:00.000Z");

      // ids unique, indexes contiguous
      expect(new Set(run.levels.map((l) => l.id)).size).toBe(run.size);
      expect(run.levels.map((l) => l.index)).toEqual(run.levels.map((_, i) => i + 1));

      // worlds partition the levels in order, about five each, boss last
      expect(run.worlds.flatMap((w) => w.levelIds)).toEqual(run.levels.map((l) => l.id));
      expect(run.worlds.map((w) => w.index)).toEqual(run.worlds.map((_, i) => i + 1));
      for (const w of run.worlds) {
        const levels = w.levelIds.map((id) => findLevel(run, id) as Level);
        expect(levels.every((l) => l.world === w.index)).toBe(true);
        expect(levels.at(-1)?.kind).toBe("boss");
        expect(levels.filter((l) => l.kind === "boss")).toHaveLength(1);
        expect(levels.length).toBeGreaterThanOrEqual(3);
        expect(levels.length).toBeLessThanOrEqual(6);
        expect(w.name.length).toBeGreaterThan(0);
      }
      const avg = run.size / run.worlds.length;
      expect(avg).toBeGreaterThanOrEqual(4);
      expect(avg).toBeLessThanOrEqual(5.5);

      // difficulty ramps 1..5 and never falls
      const d = run.levels.map((l) => l.difficulty);
      expect(d[0]).toBe(1);
      expect(d.at(-1)).toBe(5);
      for (let i = 1; i < d.length; i++) expect(d[i]).toBeGreaterThanOrEqual(d[i - 1]);

      // hearts and rounds
      for (const l of run.levels) {
        expect(l.hearts).toBe(l.kind === "boss" ? 4 : 3);
        expect(l.items).toBeDefined();
        expect(l.rounds).toBe(l.items?.length);
        expect(l.rounds).toBeGreaterThanOrEqual(l.kind === "boss" ? 3 : 2);
        expect(l.rounds).toBeLessThanOrEqual(8);
        expect(l.title.length).toBeGreaterThan(0);
        expect(l.blurb.length).toBeGreaterThan(0);
        expect(l.conceptIds.length).toBeGreaterThan(0);
      }
    });

    it(`${course.id}: every claim is checkable against the player's own page`, () => {
      const run = generateRun(course);
      const conceptIds = new Set(course.concepts.map((c) => c.id));
      const allText = flat(course.sources.flatMap((s) => s.chunks.map((c) => c.text)).join(" "));
      for (const level of run.levels) {
        for (const item of level.items ?? []) {
          expect(conceptIds.has(item.conceptId)).toBe(true);
          if (item.type !== "catch") continue;
          const chunk = pageOf(course, item.passageId);
          expect(chunk, `${level.id} passage`).toBeDefined();
          expect(item.page).toBe(chunk?.locator.page ?? null);
          expect(flat(chunk!.text)).toContain(item.source);
          if (item.isBluff) {
            expect(item.alteration).not.toBeNull();
            expect(item.claim).not.toBe(item.source);
            expect(allText).not.toContain(item.claim);
            if (item.alteration!.kind !== "trap") {
              expect(guardBacksBluff(item.claim, item.source), `${level.id}: ${item.claim}`).toBe(true);
              expect(item.claim).toContain(item.alteration!.to);
              expect(item.source).toContain(item.alteration!.from);
            }
          } else {
            expect(item.alteration).toBeNull();
            expect(item.claim).toBe(item.source);
            expect(guardBacksReal(item.claim, item.source)).toBe(true);
          }
        }
      }
    });

    it(`${course.id}: each catch level holds real claims and bluffs, none repeated inside the level`, () => {
      const run = generateRun(course);
      for (const level of run.levels.filter((l) => l.kind === "catch")) {
        const items = level.items as CatchItem[];
        expect(items.some((i) => i.isBluff)).toBe(true);
        expect(items.some((i) => !i.isBluff)).toBe(true);
        expect(new Set(items.map((i) => i.claim)).size).toBe(items.length);
        expect(new Set(items.map((i) => i.source)).size).toBe(items.length);
        expect(items.every((i) => i.type === "catch")).toBe(true);
      }
      for (const level of run.levels.filter((l) => l.kind === "say")) {
        expect(new Set((level.items ?? []).map((i) => (i.type === "say" ? i.question : ""))).size).toBe(level.rounds);
      }
    });
  }
});

describe("determinism", () => {
  it("gives a byte identical run for the same subject and options", () => {
    const a = JSON.stringify(generateRun(SAMPLE, { now: "2026-09-30T06:00:00.000Z" }));
    const b = JSON.stringify(generateRun(SAMPLE, { now: "2026-09-30T06:00:00.000Z" }));
    expect(a).toBe(b);
    for (const course of ALL) expect(JSON.stringify(generateRun(course))).toBe(JSON.stringify(generateRun(course)));
  });

  it("does not depend on the clock or on Math.random", () => {
    const orig = Math.random;
    Math.random = () => { throw new Error("Math.random must not be used"); };
    try {
      const a = JSON.stringify(generateRun(SAMPLE));
      expect(a.length).toBeGreaterThan(100);
    } finally {
      Math.random = orig;
    }
  });

  it("does not mutate its input", () => {
    const before = JSON.stringify(SAMPLE);
    generateRun(SAMPLE);
    expect(JSON.stringify(SAMPLE)).toBe(before);
  });
});

describe("sizing follows the material", () => {
  it("reaches 30 on rich material and stays at 12 or more on thin material", () => {
    const rich = generateRun(synthetic(10, 3, 6));
    expect(rich.size).toBe(30);
    expect(rich.thin).toBe(false);
    const modest = generateRun(synthetic(5, 3));
    expect(modest.size).toBeGreaterThanOrEqual(MIN_LEVELS);
    expect(modest.size).toBeLessThan(rich.size);
  });

  it("never hands a subject more levels than 30, whatever the concept count", () => {
    for (const [n, k] of [[10, 6], [12, 4], [20, 3]] as const) {
      expect(generateRun(synthetic(n, k, 5)).size).toBeLessThanOrEqual(MAX_LEVELS);
    }
  });

  it("gives the sample subject a run that is not padded to 30", () => {
    const run = generateRun(SAMPLE);
    expect(run.size).toBeLessThan(30);
    expect(run.size).toBeGreaterThanOrEqual(MIN_LEVELS);
  });

  it("reaches 12 from four concepts with a single short passage each, without reusing sentences across levels", () => {
    const run = generateRun(synthetic(4, 1, 0, 2));
    expect(run.size).toBeGreaterThanOrEqual(MIN_LEVELS);
    expect(run.thin).toBe(false);
    const seen = new Set<string>();
    for (const l of run.levels.filter((x) => x.kind === "catch")) {
      for (const i of l.items as CatchItem[]) {
        expect(seen.has(i.source), `${l.id} reuses a sentence`).toBe(false);
        seen.add(i.source);
      }
    }
  });

  it("returns a short run marked thin when there are no page sentences, instead of padding", () => {
    const bare = { ...synthetic(4, 0), sources: [{ id: "s", title: "Notes", type: "notes", chunks: [] }] };
    const run = generateRun(bare);
    expect(run.levels.some((l) => l.kind === "catch")).toBe(false);
    expect(run.levels.filter((l) => l.kind !== "boss").every((l) => l.kind === "say")).toBe(true);
    expect(run.size).toBeLessThan(MIN_LEVELS);
    expect(run.thin).toBe(true);
    expect(generateRun(SAMPLE).thin).toBe(false);
  });
});

describe("catch claims come from traps and page sentences", () => {
  it("uses the course traps as bluffs where a page corrects them", () => {
    const run = generateRun(SAMPLE);
    const trapBluffs = run.levels.flatMap((l) => (l.kind === "catch" ? (l.items as CatchItem[]) : [])).filter((i) => i.trapId);
    expect(trapBluffs.length).toBeGreaterThan(0);
    const trap = SAMPLE.traps.find((t) => t.id === trapBluffs[0].trapId)!;
    expect(trapBluffs[0].claim).toBe(trap.statement);
    expect(trapBluffs[0].isBluff).toBe(true);
    expect(trapBluffs[0].alteration).toEqual({ kind: "trap", from: trap.correct, to: trap.statement });
  });

  it("builds altered bluffs from real page sentences on a subject with no traps", () => {
    const run = generateRun(synthetic(6, 2, 0));
    const bluffs = run.levels.flatMap((l) => (l.kind === "catch" ? (l.items as CatchItem[]) : [])).filter((i) => i.isBluff);
    expect(bluffs.length).toBeGreaterThan(0);
    expect(bluffs.every((b) => b.alteration && b.alteration.kind !== "trap")).toBe(true);
  });

  it("only offers standalone sentences", () => {
    const s = sentencesOf("Attention is useful for long inputs because it links far tokens. It also helps a lot. Exam questions on this point ask what is lost. Short one.");
    expect(s).toEqual(["Attention is useful for long inputs because it links far tokens."]);
  });
});

describe("recall levels", () => {
  const base = generateRun(SAMPLE);
  const weakIds = ["c_position", "c_backprop"];

  it("adds recall levels for missed concepts inside the first unfinished world, before its boss", () => {
    const run = withRecall(base, SAMPLE, progress({ weakConceptIds: weakIds }));
    const recalls = run.levels.filter((l) => l.kind === "recall");
    expect(recalls.length).toBe(1);
    expect(recalls[0].conceptIds).toEqual(weakIds);
    expect(recalls[0].hearts).toBe(3);
    expect(recalls[0].items?.every((i) => i.type === "say")).toBe(true);
    expect(recalls[0].rounds).toBeGreaterThanOrEqual(2);
    const world = run.worlds.find((w) => w.index === recalls[0].world)!;
    expect(world.levelIds.at(-1)).toBe(run.levels.find((l) => l.kind === "boss" && l.world === world.index)!.id);
    expect(world.levelIds.at(-2)).toBe(recalls[0].id);
    expect(run.size).toBe(base.size + 1);
    expect(run.levels.map((l) => l.index)).toEqual(run.levels.map((_, i) => i + 1));
    expect(run.worlds.flatMap((w) => w.levelIds)).toEqual(run.levels.map((l) => l.id));
    expect(run.levels.at(-1)?.difficulty).toBe(5);
  });

  it("is idempotent and leaves a run with no weak concepts untouched", () => {
    const p = progress({ weakConceptIds: weakIds });
    const once = withRecall(base, SAMPLE, p);
    expect(JSON.stringify(withRecall(once, SAMPLE, p))).toBe(JSON.stringify(once));
    expect(withRecall(base, SAMPLE, progress())).toBe(base);
  });

  it("generateRun with progress equals the base run plus recall", () => {
    const p = progress({ weakConceptIds: weakIds });
    expect(JSON.stringify(generateRun(SAMPLE, { progress: p }))).toBe(JSON.stringify(withRecall(generateRun(SAMPLE), SAMPLE, p)));
  });

  it("never moves or removes a level that has a result", () => {
    const played = base.levels.slice(0, 6).map((l) => l.id);
    const p = progress({ weakConceptIds: weakIds, results: Object.fromEntries(played.map((id) => [id, { levelId: id, stars: 2 } as never])) });
    const run = withRecall(base, SAMPLE, p);
    for (const id of played) {
      expect(findLevel(run, id)).not.toBeNull();
      expect(findLevel(run, id)!.world).toBe(findLevel(base, id)!.world);
    }
  });

  it("skips worlds whose boss is already beaten and ignores concepts the subject does not have", () => {
    const boss1 = base.levels.find((l) => l.kind === "boss" && l.world === 1)!;
    const run = withRecall(base, SAMPLE, progress({ weakConceptIds: ["c_position", "c_ghost"], results: { [boss1.id]: { levelId: boss1.id, stars: 1 } as never } }));
    const recall = run.levels.find((l) => l.kind === "recall")!;
    expect(recall.world).toBeGreaterThan(1);
    expect(recall.conceptIds).toEqual(["c_position"]);
  });

  it("does not stack a second recall for a concept an unplayed recall level already covers", () => {
    const once = withRecall(base, SAMPLE, progress({ weakConceptIds: ["c_position"] }));
    const twice = withRecall(once, SAMPLE, progress({ weakConceptIds: ["c_position", "c_backprop"] }));
    const recalls = twice.levels.filter((l) => l.kind === "recall");
    expect(recalls.flatMap((l) => l.conceptIds).sort()).toEqual(["c_backprop", "c_position"]);
  });

  it("caps at three unplayed recall levels", () => {
    const many = SAMPLE.concepts.map((c) => c.id);
    const run = withRecall(base, SAMPLE, progress({ weakConceptIds: many }));
    expect(run.levels.filter((l) => l.kind === "recall").length).toBeLessThanOrEqual(3);
  });

  it("keeps the run at 30 or fewer by replacing a doubly covered, unplayed level at the cap", () => {
    const full = generateRun(synthetic(10, 3, 6));
    expect(full.size).toBe(30);
    const run = withRecall(full, synthetic(10, 3, 6), progress({ weakConceptIds: ["c0", "c1"] }));
    expect(run.size).toBeLessThanOrEqual(30);
    expect(run.levels.some((l) => l.kind === "recall")).toBe(true);
    expect(run.worlds.flatMap((w) => w.levelIds)).toEqual(run.levels.map((l) => l.id));
    for (const w of run.worlds) expect(run.levels.find((l) => l.id === w.levelIds.at(-1))?.kind).toBe("boss");
  });

  it("gives recall levels stable ids across regenerations", () => {
    const p = progress({ weakConceptIds: weakIds });
    const a = generateRun(SAMPLE, { progress: p }).levels.find((l) => l.kind === "recall")!.id;
    const b = generateRun(SAMPLE, { progress: p }).levels.find((l) => l.kind === "recall")!.id;
    expect(a).toBe(b);
  });
});

describe("run shape as JSON", () => {
  it("survives a JSON round trip unchanged", () => {
    const run: Run = generateRun(SAMPLE, { now: "2026-09-30T06:00:00.000Z" });
    expect(JSON.parse(JSON.stringify(run))).toEqual(run);
  });
});
