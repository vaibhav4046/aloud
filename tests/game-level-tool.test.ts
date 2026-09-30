import { afterEach, describe, expect, it, vi } from "vitest";
import { generateRun } from "@/lib/game/run";
import { getCourse } from "@/lib/courses";
import { LevelController, type RoundClosed } from "@/components/game/level-controller";
import { runLevelToolStrict, toolFailed } from "@/components/game/level-tool";

/**
 * A tool that answers 200 with an `error` result (the shape every refusal has)
 * is a failed check. The typed path used to hand that result to the round and
 * wait, and the screen stayed on "Checking your page" for good.
 */

const ctx = { subjectId: "s1", levelId: "l1", sessionId: null };
const reply = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status }));

afterEach(() => vi.unstubAllGlobals());

describe("runLevelToolStrict", () => {
  it("throws when the server answers with an error result and isError false", async () => {
    vi.stubGlobal("fetch", reply({ callId: "c", isError: false, result: { error: "I cannot grade that without the subject's map." } }));
    await expect(runLevelToolStrict("grade_my_answer", { question: "q", answer: "a" }, "c", ctx)).rejects.toThrow();
  });

  it("throws on an HTTP failure and on an unreadable body", async () => {
    vi.stubGlobal("fetch", reply({ error: { code: "RATE_LIMITED" } }, 429));
    await expect(runLevelToolStrict("grade_my_answer", {}, "c", ctx)).rejects.toThrow();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("not json", { status: 200 })));
    await expect(runLevelToolStrict("grade_my_answer", {}, "c", ctx)).rejects.toThrow();
  });

  it("returns a real result untouched", async () => {
    vi.stubGlobal("fetch", reply({ callId: "c", isError: false, result: { verdict: "correct" } }));
    await expect(runLevelToolStrict("grade_my_answer", {}, "c", ctx)).resolves.toEqual({ verdict: "correct" });
  });

  it("toolFailed recognises a refusal and a missing result", () => {
    expect(toolFailed({ error: "x", tell_the_student: "x" })).toBe(true);
    expect(toolFailed(null)).toBe(true);
    expect(toolFailed({})).toBe(true);
    expect(toolFailed({ verdict: "supported" })).toBe(false);
  });
});

describe("LevelController.skip", () => {
  const run = generateRun(getCourse("course_transformers_w4") as never, { now: "2026-09-30T00:00:00.000Z" });
  const level = run.levels.find((l) => l.kind === "say")!;

  it("closes a round that could not be checked as skipped and moves on", () => {
    const closed: RoundClosed[] = [];
    const c = new LevelController(level, [], () => 0, (x) => closed.push(x));
    c.tool("grade_my_answer", { question: "q", answer: "a" }, { error: "I cannot grade that" });
    expect(closed).toHaveLength(0);
    c.skip();
    expect(closed).toHaveLength(1);
    expect(closed[0].report.outcome).toBe("skipped");
    expect(c.index).toBe(1);
  });

  it("ends the level after the last round and ignores further events", () => {
    const closed: RoundClosed[] = [];
    const c = new LevelController(level, [], () => 0, (x) => closed.push(x));
    for (let i = 0; i < level.rounds; i++) c.skip();
    expect(closed).toHaveLength(level.rounds);
    c.skip();
    expect(closed).toHaveLength(level.rounds);
  });
});
