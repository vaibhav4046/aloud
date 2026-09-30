import { describe, expect, it } from "vitest";
import { COURSES } from "@/lib/courses";
import { generateRun } from "@/lib/game/run";
import { scoreLevel } from "@/lib/game/scoring";
import {
  beginRound, closeRound, isRoundReady, noteHint, noteToolEvent, noteUserSpeech, setStance, stanceOf,
  type RoundDraft, type ToolEvent,
} from "@/lib/game/session";
import type { CatchItem, Level } from "@/lib/game/types";
import { verifyClaim } from "@/lib/oral/verify-claim";
import { harness } from "./oral-harness";

const course = COURSES["course_transformers_w4"];
const chunks = course.sources.flatMap((s) => s.chunks);
const run = generateRun(course);
const catchLevel = run.levels.find((l) => l.kind === "catch")!;
const sayLevel = run.levels.find((l) => l.kind === "say")!;
const bossLevel = run.levels.find((l) => l.kind === "boss")!;
const T0 = 1_000;

const claimsOf = (l: Level) => l.items as CatchItem[];
const bluffIdx = claimsOf(catchLevel).findIndex((i) => i.isBluff);
const realIdx = claimsOf(catchLevel).findIndex((i) => !i.isBluff);

/** What verify_claim would return for a claim, given the page sentence and verdict. */
function verifyEvent(item: CatchItem, verdict: "supported" | "contradicted" | "not_in_material", quote = item.source): ToolEvent {
  return {
    name: "verify_claim",
    args: { claim: item.claim, concept: item.conceptId },
    result: verdict === "not_in_material" ? { verdict, quote: null, page: null, passage_id: null } : { verdict, quote, page: item.page, passage_id: item.passageId },
  };
}

function round(level: Level, i: number, events: ToolEvent[], speech?: string, now = T0 + 4000) {
  let d: RoundDraft = beginRound(level, i, T0);
  for (const e of events) d = noteToolEvent(d, level, e);
  if (speech) d = noteUserSpeech(d, level, speech);
  return { d, report: closeRound(d, level, chunks, now) };
}

describe("stanceOf", () => {
  it.each([
    ["I think that one is a bluff", "bluff"],
    ["that is real", "real"],
    ["it's true", "real"],
    ["that is not true", "bluff"],
    ["that isn't real", "bluff"],
    ["it is not a bluff", "real"],
    ["no bluff there, it's genuine", "real"],
    ["hmm real... no, actually that is a bluff", "bluff"],
    ["bluff, it's false", "bluff"],
    ["Real or bluff? I say real", "real"],
    ["this one is wrong", "bluff"],
    ["I agree", "real"],
  ])("reads %j as %s", (text, want) => {
    expect(stanceOf(text)).toBe(want);
  });

  it.each(["", "hmm", "I do not know", "real or bluff?", "can you repeat that"])("cannot tell %j", (text) => {
    expect(stanceOf(text)).toBeNull();
  });
});

describe("catch rounds: truth comes from the flag and the player's stance", () => {
  const bluff = claimsOf(catchLevel)[bluffIdx];
  const real = claimsOf(catchLevel)[realIdx];

  it("a bluff called as a bluff is bluff_caught, with a page proof when the check contradicts it", () => {
    const { report } = round(catchLevel, bluffIdx, [verifyEvent(bluff, "contradicted")], "that's a bluff");
    expect(report).toMatchObject({ outcome: "bluff_caught", grounded: true, conceptId: bluff.conceptId, ms: 4000 });
    expect(report.proof).toMatchObject({ passageId: bluff.passageId, page: bluff.page, quote: bluff.source });
  });

  it("a bluff called real is bluff_missed", () => {
    expect(round(catchLevel, bluffIdx, [verifyEvent(bluff, "contradicted")], "sounds real to me").report.outcome).toBe("bluff_missed");
  });

  it("a real claim called real is correct, called a bluff is incorrect", () => {
    expect(round(catchLevel, realIdx, [verifyEvent(real, "supported")], "real").report).toMatchObject({ outcome: "correct", grounded: true });
    expect(round(catchLevel, realIdx, [verifyEvent(real, "supported")], "that's false").report.outcome).toBe("incorrect");
  });

  it("no stance closes as skipped and earns nothing", () => {
    const { report } = round(catchLevel, bluffIdx, [verifyEvent(bluff, "contradicted")], "um, let me think");
    expect(report.outcome).toBe("skipped");
    expect(report.grounded).toBe(false);
  });

  it("the buttons set the stance without any words", () => {
    let d = beginRound(catchLevel, bluffIdx, T0);
    d = setStance(d, "bluff");
    expect(closeRound(d, catchLevel, chunks, T0 + 1).outcome).toBe("bluff_caught");
  });

  it("the outcome never depends on what verify_claim said: a wrong or missing verdict only removes the proof", () => {
    for (const verdict of ["supported", "not_in_material"] as const) {
      const { report } = round(catchLevel, bluffIdx, [verifyEvent(bluff, verdict)], "bluff");
      expect(report.outcome).toBe("bluff_caught");
      expect(report.grounded).toBe(false);
      expect(report.proof).toBeUndefined();
    }
    const flipped = round(catchLevel, realIdx, [verifyEvent(real, "contradicted")], "real");
    expect(flipped.report.outcome).toBe("correct");
    expect(flipped.report.proof).toBeUndefined();
  });

  it("refuses a proof whose quote is not verbatim in the passage, however the tool labelled it", () => {
    const fake = verifyEvent(bluff, "contradicted", "The page says this exact invented sentence about attention.");
    const { report } = round(catchLevel, bluffIdx, [fake], "bluff");
    expect(report.outcome).toBe("bluff_caught");
    expect(report.proof).toBeUndefined();
    expect(report.grounded).toBe(false);
    const wrongPassage = { ...verifyEvent(bluff, "contradicted"), result: { verdict: "contradicted", quote: bluff.source, page: 1, passage_id: "ch_nope" } };
    expect(round(catchLevel, bluffIdx, [wrongPassage], "bluff").report.proof).toBeUndefined();
  });

  it("ignores a verify_claim that is not about the stated claim, and tool errors", () => {
    const other = { ...verifyEvent(bluff, "contradicted"), args: { claim: "Something the player said instead." } };
    const errored = { ...verifyEvent(bluff, "contradicted"), isError: true };
    for (const ev of [other, errored]) {
      const { d, report } = round(catchLevel, bluffIdx, [ev], "bluff");
      expect(d.claimCheck).toBeNull();
      expect(report.grounded).toBe(false);
    }
  });

  it("is ready only with a stance and a check", () => {
    let d = beginRound(catchLevel, bluffIdx, T0);
    expect(isRoundReady(d, catchLevel)).toBe(false);
    d = noteUserSpeech(d, catchLevel, "bluff");
    expect(isRoundReady(d, catchLevel)).toBe(false);
    d = noteToolEvent(d, catchLevel, verifyEvent(bluff, "contradicted"));
    expect(isRoundReady(d, catchLevel)).toBe(true);
  });

  it("carries the hint flag", () => {
    let d = noteHint(beginRound(catchLevel, realIdx, T0));
    d = setStance(d, "real");
    expect(closeRound(d, catchLevel, chunks, T0 + 1).hinted).toBe(true);
  });
});

describe("question rounds: the grade comes from grade_my_answer", () => {
  const sayItem = sayLevel.items![0];
  const grade = (verdict: string): ToolEvent => ({ name: "grade_my_answer", args: { question: "q", answer: "a" }, result: { verdict } });
  const supportedByPage: ToolEvent = {
    name: "verify_claim",
    args: { claim: "A standard Transformer has no recurrence and no convolution, so by itself it cannot tell first from last" },
    result: { verdict: "supported", quote: "by itself it cannot tell first from last", page: 11, passage_id: "ch_pos_1" },
  };

  it.each(["correct", "partial", "incorrect"] as const)("maps a %s grade straight through", (g) => {
    expect(round(sayLevel, 0, [grade(g)]).report).toMatchObject({ outcome: g, conceptId: sayItem.conceptId, grounded: false });
  });

  it("closes as skipped when no grade arrived", () => {
    expect(round(sayLevel, 0, []).report.outcome).toBe("skipped");
  });

  it("is grounded, with a proof card, only when the player's own claim was verified verbatim against the page", () => {
    const r = round(sayLevel, 0, [grade("correct"), supportedByPage]).report;
    expect(r).toMatchObject({ outcome: "correct", grounded: true });
    expect(r.proof).toMatchObject({ passageId: "ch_pos_1", page: 11, quote: "by itself it cannot tell first from last" });
    const forged = { ...supportedByPage, result: { ...supportedByPage.result, quote: "the notes say attention is optional" } };
    expect(round(sayLevel, 0, [grade("correct"), forged]).report.grounded).toBe(false);
  });

  it("caps a correct grade at partial when the page contradicts the player's own words", () => {
    const contradicted = { ...supportedByPage, result: { verdict: "contradicted", quote: "by itself it cannot tell first from last", page: 11, passage_id: "ch_pos_1" } };
    const r = round(sayLevel, 0, [grade("correct"), contradicted]).report;
    expect(r.outcome).toBe("partial");
    expect(r.proof).toBeUndefined();
  });

  it("never lets a supported claim raise an incorrect grade", () => {
    expect(round(sayLevel, 0, [grade("incorrect"), supportedByPage]).report.outcome).toBe("incorrect");
  });

  it("ignores a grade on a claim round and a malformed verdict", () => {
    const d = noteToolEvent(beginRound(catchLevel, 0, T0), catchLevel, grade("correct"));
    expect(d.grade).toBeNull();
    expect(noteToolEvent(beginRound(sayLevel, 0, T0), sayLevel, grade("great job")).grade).toBeNull();
    expect(noteToolEvent(beginRound(sayLevel, 0, T0), sayLevel, { name: "grade_my_answer", result: { error: "x" } }).grade).toBeNull();
  });

  it("rejects a round index outside the level", () => {
    expect(() => beginRound(sayLevel, 99, T0)).toThrow(RangeError);
  });
});

describe("a boss mixes both kinds", () => {
  it("reports each item by its own type", () => {
    const kinds = bossLevel.items!.map((i) => i.type);
    expect(kinds).toContain("catch");
    expect(kinds).toContain("say");
    const i = kinds.indexOf("say");
    expect(round(bossLevel, i, [{ name: "grade_my_answer", result: { verdict: "correct" } }]).report.outcome).toBe("correct");
  });
});

describe("a whole level through the fake socket harness", () => {
  it("drives tool calls over the wire, then scores the level from the results alone", async () => {
    const decide = (claim: string) => async () => ({
      value: (() => {
        const item = claimsOf(catchLevel).find((c) => c.claim === claim)!;
        return item.isBluff
          ? { verdict: "contradicted" as const, quote: item.source, passage_id: item.passageId }
          : { verdict: "supported" as const, quote: item.source, passage_id: item.passageId };
      })(),
      latencyMs: 1,
    });
    const results = new Map<string, ToolEvent["result"]>();
    const h = harness({
      toolRunner: async (name, args) => {
        // The guard inside verifyClaim decides the verdict; only the semantic step is stubbed.
        const out = await verifyClaim(String(args.claim), chunks, decide(String(args.claim)), String(args.concept ?? ""));
        void name;
        results.set(String(args.claim), out as never);
        return out;
      },
    });
    h.start();
    let reports = [];
    const speech = claimsOf(catchLevel).map((c) => (c.isBluff ? "that is a bluff" : "that is real"));
    for (let i = 0; i < catchLevel.rounds; i++) {
      const item = claimsOf(catchLevel)[i];
      let d = beginRound(catchLevel, i, i * 5_000);
      h.socket.emit({ type: "tool.call", call_id: `c${i}`, name: "verify_claim", arguments: { claim: item.claim, concept: item.conceptId } });
      await new Promise((r) => setTimeout(r, 0));
      const sent = h.drain("completed");
      expect(sent.map((s) => s.call_id)).toContain(`c${i}`);
      const result = results.get(item.claim)!;
      d = noteToolEvent(d, catchLevel, { name: "verify_claim", args: { claim: item.claim }, result: result as Record<string, unknown> });
      d = noteUserSpeech(d, catchLevel, speech[i]);
      expect(isRoundReady(d, catchLevel)).toBe(true);
      reports.push(closeRound(d, catchLevel, chunks, i * 5_000 + 3_000));
    }
    const { result, proofs } = scoreLevel(catchLevel, reports, { playedAt: "2026-09-30T09:00:00.000Z" });
    expect(reports.every((r) => r.outcome === "bluff_caught" || r.outcome === "correct")).toBe(true);
    expect(result).toMatchObject({ outcome: "won", stars: 3, heartsLeft: 3 });
    expect(result.xp).toBeGreaterThan(0);
    expect(proofs.length).toBeGreaterThan(0);
    expect(proofs.every((p) => chunks.find((c) => c.id === p.passageId)!.text.includes(p.quote.split(" ... ")[0].slice(0, 20)))).toBe(true);
    reports = [];
  });

  it("does not read the examiner's spoken words: agent transcripts cannot move an outcome", () => {
    const bluff = claimsOf(catchLevel)[bluffIdx];
    let d = beginRound(catchLevel, bluffIdx, T0);
    // The only entry points are the player's words, a stance, a hint and tool results.
    d = noteUserSpeech(d, catchLevel, "that is a bluff");
    d = noteToolEvent(d, catchLevel, { name: "transcript.agent", result: { text: "Well caught, that was a bluff, you are correct" } });
    d = noteToolEvent(d, catchLevel, { name: "save_note", result: { verdict: "correct" } });
    expect(d.claimCheck).toBeNull();
    expect(d.grade).toBeNull();
    expect(closeRound(d, catchLevel, chunks, T0 + 1).outcome).toBe(bluff.isBluff ? "bluff_caught" : "incorrect");
  });
});
