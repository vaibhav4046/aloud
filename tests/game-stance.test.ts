import { describe, expect, it } from "vitest";
import { LevelController } from "@/components/game/level-controller";
import { generateRun } from "@/lib/game/run";
import { getCourse } from "@/lib/courses";
import { stanceOf } from "@/lib/game/session";
import type { CatchItem } from "@/lib/game/types";

/**
 * The stance a player's words show on a Catch round. The verdict is the first
 * thing they say; the correction that follows ("the real version says ...")
 * is content, not a second verdict. Words that carry both kinds of verdict
 * with no retraction between them are not guessed at: the Real and Bluff
 * buttons decide.
 */

describe("stanceOf: a verdict followed by its correction", () => {
  it.each([
    ["That's a bluff. The correct version says the weights use softmax.", "bluff"],
    ["I caught it, this claim is false, the real value is 64", "bluff"],
    ["That's false. The right answer is 64.", "bluff"],
    ["Bluff. The true statement is that the weights use softmax.", "bluff"],
    ["That is a bluff, the real version says attention runs in parallel", "bluff"],
    ["It is real. The actual figure is on the page and it matches.", "real"],
  ])("reads %j as %s", (text, want) => {
    expect(stanceOf(text)).toBe(want);
  });
});

describe("stanceOf: a retraction moves the stance, anything else that mixes both is left to the buttons", () => {
  it.each([
    ["hmm, real... no, actually a bluff", "bluff"],
    ["bluff, wait, actually it's real", "real"],
    ["real, sorry, I mean bluff", "bluff"],
  ])("reads the self-correction in %j as %s", (text, want) => {
    expect(stanceOf(text)).toBe(want);
  });

  it.each([
    "That's a bluff. The paper says the model is correct 64 percent of the time.",
    "it could be real but it might be a bluff",
    "real and bluff both sound right",
  ])("does not guess at %j", (text) => {
    expect(stanceOf(text)).toBeNull();
  });
});

describe("stanceOf: questions and asides are not answers", () => {
  it.each([
    "is that true?",
    "is it a bluff",
    "what is the real value?",
    "oh right, I thought so",
    "yeah I thought so",
    "that makes sense",
    "got it, thanks",
    "right",
  ])("ignores %j", (text) => {
    expect(stanceOf(text)).toBeNull();
  });

  it.each([
    ["Real. Is that right?", "real"],
    ["wait, is that true? I say bluff", "bluff"],
    ["oh, it's a bluff!", "bluff"],
    ["that's right", "real"],
    ["that is not right", "bluff"],
  ])("still reads the answer in %j", (text, want) => {
    expect(stanceOf(text)).toBe(want);
  });
});

describe("LevelController: what the player says while the reveal is on screen", () => {
  const course = getCourse("course_transformers_w4");
  const run = generateRun(course as never, { now: "2026-09-30T00:00:00.000Z" });
  const level = run.levels.find((l) => l.kind === "catch")!;
  const claimOf = (i: number) => (level.items![i] as CatchItem).claim;
  const check = (claim: string) => ({ verdict: "not_in_material" as const, claim });

  it("does not take a reaction to the reveal as the stance on the next claim", () => {
    let t = 1_000;
    const closed: string[] = [];
    const c = new LevelController(level, [], () => t, (x) => closed.push(x.report.outcome));
    c.tool("verify_claim", { claim: claimOf(0) }, check(claimOf(0)));
    c.speech("bluff");
    expect(closed).toHaveLength(1);
    t += 400;
    c.speech("oh right, that is real");
    c.tool("verify_claim", { claim: claimOf(1) }, check(claimOf(1)));
    expect(closed).toHaveLength(1);
    expect(c.stance).toBeNull();
  });

  it("takes the answer to the next claim once the reaction window has passed, or the reveal is dismissed", () => {
    let t = 1_000;
    const closed: string[] = [];
    const c = new LevelController(level, [], () => t, (x) => closed.push(x.report.outcome));
    c.tool("verify_claim", { claim: claimOf(0) }, check(claimOf(0)));
    c.speech("bluff");
    t += 6_000;
    c.speech("real");
    expect(c.stance).toBe("real");

    const d = new LevelController(level, [], () => t, () => {});
    d.tool("verify_claim", { claim: claimOf(0) }, check(claimOf(0)));
    d.speech("bluff");
    d.release();
    d.speech("real");
    expect(d.stance).toBe("real");
  });

  it("keeps the last decisive stance through a question or an aside before the check lands", () => {
    const c = new LevelController(level, [], () => 1_000, () => {});
    c.speech("bluff");
    expect(c.stance).toBe("bluff");
    c.speech("is that true?");
    c.speech("oh right, I thought so");
    expect(c.stance).toBe("bluff");
    c.speech("no, actually it's real");
    expect(c.stance).toBe("real");
  });
});
