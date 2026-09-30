import { describe, expect, it } from "vitest";
import { generateRun } from "../src/lib/game/run";
import { getCourse } from "../src/lib/courses";
import { LevelController, type RoundClosed } from "../src/components/game/level-controller";
import { runVoiceTool, type ToolRunner } from "../src/components/game/voice-tools";
import { quietStep } from "../src/components/game/level-quiet";
import { buildLevelPrompt } from "../src/lib/oral/prompt";
import type { CatchItem, SayItem } from "../src/lib/game/types";

/*
 * Two defects seen live against the real Voice Agent (2026-09-30, docs/evidence/probes):
 *  1. A spoken Say round never earned a proof card or the grounded bonus, because
 *     only the typed path asked the page checker about the player's words.
 *  2. The screen advanced (and the session was closed) the instant the last answer
 *     landed, so the examiner's spoken reveal and closing line were cut off.
 */

const course = getCourse("course_transformers_w4");
const run = generateRun(course as never, { now: "2026-09-30T00:00:00.000Z" });
const chunks = course.sources.flatMap((s) => s.chunks);
const sayLevel = run.levels.find((l) => l.kind === "say")!;
const catchLevel = run.levels.find((l) => l.kind === "catch")!;

const firstSentence = (passageId: string) => chunks.find((c) => c.id === passageId)!.text.split(/(?<=[.!?])\s+/)[0];

function harness(level = sayLevel) {
  const closed: RoundClosed[] = [];
  const c = new LevelController(level, chunks, () => 1_000, (r) => closed.push(r));
  return { c, closed };
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
}

const sayItem = sayLevel.items![0] as SayItem;
const answer = "An attention weight says how much one token listens to another before the values are averaged.";
const verifyResult = () => ({ verdict: "supported", quote: firstSentence("ch_sa_1"), page: 4, passage_id: "ch_sa_1" });

describe("spoken Say rounds ask the page checker about the player's words", () => {
  it("issues a proof and the grounded flag when the checker supports the answer", async () => {
    const { c, closed } = harness();
    const calls: string[] = [];
    const run: ToolRunner = async (name) => {
      calls.push(name);
      return name === "grade_my_answer" ? { verdict: "correct" } : verifyResult();
    };
    await runVoiceTool(c, "grade_my_answer", { question: sayItem.question, answer }, "call_1", run);
    await new Promise((r) => setTimeout(r, 0));
    expect(closed).toHaveLength(1);
    expect(closed[0].report.outcome).toBe("correct");
    expect(closed[0].report.grounded).toBe(true);
    expect(closed[0].report.proof?.passageId).toBe("ch_sa_1");
    expect(calls.sort()).toEqual(["grade_my_answer", "verify_claim"]);
  });

  it("gives the model its grade at once and closes the round when the check lands", async () => {
    const { c, closed } = harness();
    const slow = deferred<Record<string, unknown>>();
    const run: ToolRunner = (name) => (name === "grade_my_answer" ? Promise.resolve({ verdict: "correct" }) : slow.promise);
    const result = await runVoiceTool(c, "grade_my_answer", { question: sayItem.question, answer }, "call_1", run);
    expect(result).toEqual({ verdict: "correct" });
    expect(closed).toHaveLength(0);
    slow.resolve(verifyResult());
    await new Promise((r) => setTimeout(r, 0));
    expect(closed).toHaveLength(1);
    expect(closed[0].report.grounded).toBe(true);
  });

  it("still closes the round from the grade when the check fails", async () => {
    const { c, closed } = harness();
    const run: ToolRunner = async (name) => {
      if (name === "verify_claim") throw new Error("timeout");
      return { verdict: "partial" };
    };
    await runVoiceTool(c, "grade_my_answer", { question: sayItem.question, answer }, "call_1", run);
    await new Promise((r) => setTimeout(r, 0));
    expect(closed).toHaveLength(1);
    expect(closed[0].report.outcome).toBe("partial");
    expect(closed[0].report.grounded).toBe(false);
  });

  it("does not run a second check on a catch round or on other tools", async () => {
    const { c } = harness(catchLevel);
    const it = catchLevel.items![0] as CatchItem;
    const calls: string[] = [];
    const run: ToolRunner = async (name) => {
      calls.push(name);
      return { verdict: "supported", quote: firstSentence(it.passageId), page: it.page, passage_id: it.passageId };
    };
    await runVoiceTool(c, "verify_claim", { claim: it.claim, concept: it.conceptId }, "call_1", run);
    expect(calls).toEqual(["verify_claim"]);
  });

  it("passes a failing grade through to the model as an error and leaves the round open", async () => {
    const { c, closed } = harness();
    const run: ToolRunner = async () => {
      throw new Error("grader down");
    };
    await expect(runVoiceTool(c, "grade_my_answer", { question: sayItem.question, answer }, "call_1", run)).rejects.toThrow("grader down");
    await new Promise((r) => setTimeout(r, 0));
    expect(closed).toHaveLength(0);
  });
});

describe("the examiner is left to finish before a reveal or the level ends", () => {
  it("is quiet only once the examiner has gone busy and come back to listening", () => {
    let s = { busySeen: false };
    let step = quietStep(s.busySeen, "USER_SPEAKING");
    expect(step.quiet).toBe(false);
    step = quietStep(step.busySeen, "THINKING");
    expect(step.quiet).toBe(false);
    step = quietStep(step.busySeen, "CHECKING_SOURCE");
    step = quietStep(step.busySeen, "SPEAKING");
    expect(step.quiet).toBe(false);
    step = quietStep(step.busySeen, "LISTENING");
    expect(step.quiet).toBe(true);
    s = { busySeen: step.busySeen };
    expect(s.busySeen).toBe(true);
  });

  it("does not treat the listening state before any reply as quiet", () => {
    expect(quietStep(false, "LISTENING").quiet).toBe(false);
  });
});

describe("the bluff reveal is read from the mark", () => {
  it("tells the examiner to say a marked bluff was a bluff even when the page check says supported", () => {
    const text = buildLevelPrompt(catchLevel);
    expect(text).toMatch(/marked bluff/i);
    expect(text).toMatch(/even if the tool result says supported/i);
  });
});
