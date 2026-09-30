import { describe, expect, it } from "vitest";
import { generateRun } from "../src/lib/game/run";
import { getCourse } from "../src/lib/courses";
import { LevelController, type RoundClosed } from "../src/components/game/level-controller";
import { runVoiceTool, type ToolRunner } from "../src/components/game/voice-tools";
import { buildLevelPrompt } from "../src/lib/oral/prompt";
import type { CatchItem } from "../src/lib/game/types";

/*
 * Live defect, 2026-09-30: the player's spoken answer was misheard, so the game held
 * no stance. The examiner still called verify_claim, revealed, and went on to claim 3
 * while the screen sat on claim 1. The game is now authoritative on round progress:
 * the examiner's verify_claim result says whether the round is open or closed, and
 * carries a verdict only when it is closed.
 */

const course = getCourse("course_transformers_w4");
const run = generateRun(course as never, { now: "2026-09-30T00:00:00.000Z" });
const chunks = course.sources.flatMap((s) => s.chunks);
const catchLevel = run.levels.find((l) => l.kind === "catch")!;
const items = catchLevel.items as CatchItem[];
const first = items[0];
const quoteOf = (passageId: string) => chunks.find((c) => c.id === passageId)!.text.split(/(?<=[.!?])\s+/)[0];

const verdictFor = (it: CatchItem) => ({
  verdict: it.isBluff ? "contradicted" : "supported",
  quote: quoteOf(it.passageId),
  page: it.page,
  passage_id: it.passageId,
});
const runner: ToolRunner = async (_n, args) => verdictFor(items.find((i) => i.claim === args.claim) ?? first);

function harness(clock: { t: number } = { t: 1_000 }) {
  const closed: RoundClosed[] = [];
  const c = new LevelController(catchLevel, chunks, () => clock.t, (r) => closed.push(r));
  return { c, closed, clock };
}

/** What the game does for a level round: the prefetched page check goes in before any words. */
const prefetch = (c: LevelController, it: CatchItem) => c.tool("verify_claim", { claim: it.claim, concept: it.conceptId }, verdictFor(it));

describe("the examiner may advance only after the game reports the round closed", () => {
  it("returns no verdict and says the round is open when the player's words gave no stance", async () => {
    const { c, closed } = harness();
    prefetch(c, first);
    c.speech("uhm the mumble of the thing is");
    const result = await runVoiceTool(c, "verify_claim", { claim: first.claim, concept: first.conceptId }, "call_1", runner, 0);
    expect(result.round).toBe("open");
    expect(result.verdict).toBeUndefined();
    expect(String(result.instruction)).toMatch(/do not reveal/i);
    expect(closed).toHaveLength(0);
    expect(c.index).toBe(0);
  });

  it("returns the verdict and round closed once the stance has closed the round", async () => {
    const { c, closed } = harness();
    prefetch(c, first);
    c.speech(first.isBluff ? "that is a bluff" : "that is real");
    expect(closed).toHaveLength(1);
    const result = await runVoiceTool(c, "verify_claim", { claim: first.claim, concept: first.conceptId }, "call_1", runner, 0);
    expect(result.round).toBe("closed");
    expect(result.verdict).toBe(first.isBluff ? "contradicted" : "supported");
  });

  it("keeps saying open on a second call until the stance arrives, then closes", async () => {
    const { c, closed } = harness();
    prefetch(c, first);
    const a = await runVoiceTool(c, "verify_claim", { claim: first.claim, concept: first.conceptId }, "call_1", runner, 0);
    expect(a.round).toBe("open");
    c.choose(first.isBluff ? "bluff" : "real");
    expect(closed).toHaveLength(1);
    const b = await runVoiceTool(c, "verify_claim", { claim: first.claim, concept: first.conceptId }, "call_2", runner, 0);
    expect(b.round).toBe("closed");
  });

  it("waits a short grace for a transcript that is still on its way", async () => {
    const { c, closed } = harness();
    prefetch(c, first);
    setTimeout(() => c.speech(first.isBluff ? "bluff" : "real"), 20);
    const result = await runVoiceTool(c, "verify_claim", { claim: first.claim, concept: first.conceptId }, "call_1", runner, 500);
    expect(closed).toHaveLength(1);
    expect(result.round).toBe("closed");
  });

  it("does not gate a Say tool or a claim the level does not hold", async () => {
    const { c } = harness();
    const r = await runVoiceTool(c, "verify_claim", { claim: "Something the level never stated.", concept: "x" }, "call_1", async () => ({ verdict: "not_in_material" }), 0);
    expect(r).toEqual({ verdict: "not_in_material" });
  });

  it("tells the examiner in its rules to wait for round closed", () => {
    const text = buildLevelPrompt(catchLevel);
    expect(text).toMatch(/round is open/i);
    expect(text).toMatch(/never state the next claim before/i);
  });
});

describe("a late turn from a closed round never feeds the next round", () => {
  it("ignores a turn whose speech began before the round closed", () => {
    const { c, closed, clock } = harness();
    prefetch(c, first);
    c.choose(first.isBluff ? "bluff" : "real"); // a tap closes round 1 at t=1000
    expect(closed).toHaveLength(1);
    const second = items[1];
    prefetch(c, second);
    clock.t = 1_000 + 60_000; // the reveal grace is long over
    c.speech(second.isBluff ? "real" : "that's a bluff", 900); // began at t=900, before the close
    expect(c.stance).toBeNull();
    expect(closed).toHaveLength(1);
  });

  it("still reads a turn that began after the round closed and the reveal grace passed", () => {
    const { c, closed, clock } = harness();
    prefetch(c, first);
    c.choose(first.isBluff ? "bluff" : "real");
    const second = items[1];
    prefetch(c, second);
    clock.t = 1_000 + 60_000;
    c.speech(second.isBluff ? "that's a bluff" : "that is real", clock.t - 500);
    expect(closed).toHaveLength(2);
  });
});
