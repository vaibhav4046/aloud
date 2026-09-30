import { describe, expect, it } from "vitest";
import { generateRun } from "../src/lib/game/run";
import { getCourse } from "../src/lib/courses";
import { openOralSocket } from "../src/lib/oral/socket";
import { LevelController, type RoundClosed } from "../src/components/game/level-controller";
import { beginRound, closeRound, isRoundReady, noteToolEvent, noteUserSpeech, setStance, stanceOf } from "../src/lib/game/session";
import { initialPlay, playReducer, type PlayState } from "../src/components/game/play-model";
import { finishLevel } from "../src/components/game/engine-port";
import type { CatchItem, Level, SayItem } from "../src/lib/game/types";

const course = getCourse("course_transformers_w4");
const run = generateRun(course as never, { now: "2026-09-30T00:00:00.000Z" });
const chunks = course.sources.flatMap((s) => s.chunks);
const sayLevel = run.levels.find((l) => l.kind === "say")!;
const catchLevel = run.levels.find((l) => l.kind === "catch")!;
// Each read moves the clock on, as real seconds pass between a player's rounds.
let clock = 1_000;
const now = () => (clock += 3_000);

const quoteOf = (passageId: string) => {
  const c = chunks.find((x) => x.id === passageId)!;
  return c.text.split(/(?<=[.!?])\s+/)[0];
};

describe("round outcomes come from code", () => {
  const items = catchLevel.items as CatchItem[];
  const bluff = items.find((i) => i.isBluff)!;
  const real = items.find((i) => !i.isBluff)!;
  const lvl = (item: CatchItem): Level => ({ ...catchLevel, items: [item], rounds: 1 });
  const close = (item: CatchItem, stance: "real" | "bluff" | null) => {
    let d = beginRound(lvl(item), 0, 0);
    if (stance) d = setStance(d, stance);
    return closeRound(d, lvl(item), chunks, 500);
  };

  it("maps every stance against the flag", () => {
    expect(close(bluff, "bluff").outcome).toBe("bluff_caught");
    expect(close(bluff, "real").outcome).toBe("bluff_missed");
    expect(close(real, "real").outcome).toBe("correct");
    expect(close(real, "bluff").outcome).toBe("incorrect");
    expect(close(real, null).outcome).toBe("skipped");
  });

  it("reads the stance from words, and bluff wins over true in 'not true'", () => {
    expect(stanceOf("that is not true")).toBe("bluff");
    expect(stanceOf("I think that is real")).toBe("real");
    expect(stanceOf("hmm")).toBeNull();
    const l = lvl(bluff);
    expect(noteUserSpeech(beginRound(l, 0, 0), l, "that's a bluff").stance).toBe("bluff");
  });

  it("a proof needs a verbatim quote that agrees with the flag", () => {
    const l = lvl(real);
    let d = beginRound(l, 0, 0);
    const good = { name: "verify_claim", args: { claim: real.claim }, result: { verdict: "supported", quote: quoteOf(real.passageId), page: real.page, passage_id: real.passageId } };
    d = setStance(noteToolEvent(d, l, good), "real");
    const r = closeRound(d, l, chunks, 10);
    expect(r.grounded).toBe(true);
    expect(r.proof?.passageId).toBe(real.passageId);

    const forged = { ...good, result: { ...good.result, quote: "A sentence that is not on any page." } };
    const r2 = closeRound(setStance(noteToolEvent(beginRound(l, 0, 0), l, forged), "real"), l, chunks, 10);
    expect(r2.grounded).toBe(false);
    expect(r2.proof).toBeUndefined();
    expect(r2.outcome).toBe("correct");
  });

  it("ignores a page check about some other claim", () => {
    const l = lvl(real);
    const other = { name: "verify_claim", args: { claim: "Gradient descent minimises a loss." }, result: { verdict: "supported", quote: quoteOf(real.passageId), page: 1, passage_id: real.passageId } };
    expect(closeRound(setStance(noteToolEvent(beginRound(l, 0, 0), l, other), "real"), l, chunks, 5).proof).toBeUndefined();
  });

  it("a say round closes on the grade, a contradiction caps it at partial, and an ungrounded quote earns nothing", () => {
    const item = sayLevel.items![0] as SayItem;
    const l: Level = { ...sayLevel, items: [item], rounds: 1 };
    let d = beginRound(l, 0, 0);
    expect(isRoundReady(d, l)).toBe(false);
    d = noteToolEvent(d, l, { name: "verify_claim", args: { claim: "x" }, result: { verdict: "contradicted", quote: quoteOf("ch_sa_1"), page: 4, passage_id: "ch_sa_1" } });
    d = noteToolEvent(d, l, { name: "grade_my_answer", args: {}, result: { verdict: "correct" } });
    expect(isRoundReady(d, l)).toBe(true);
    const r = closeRound(d, l, chunks, 5);
    expect(r.outcome).toBe("partial");
    expect(r.proof).toBeUndefined();
  });
});

/* ---- the real socket client, a fake WebSocket, the controller and the reducer ---- */

class FakeWS {
  static last: FakeWS;
  readyState = 1;
  sent: Record<string, unknown>[] = [];
  onopen: ((e: unknown) => void) | null = null;
  onmessage: ((e: unknown) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onclose: ((e: unknown) => void) | null = null;
  private l: Record<string, ((e: unknown) => void)[]> = {};
  constructor(readonly url: string) {
    FakeWS.last = this;
  }
  addEventListener(t: string, f: (e: unknown) => void) {
    (this.l[t] ??= []).push(f);
  }
  removeEventListener() {}
  send(raw: string) {
    this.sent.push(JSON.parse(raw));
  }
  close() {}
  emit(msg: Record<string, unknown>) {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }
}

const tick = () => new Promise((r) => setTimeout(r, 5));

async function playThroughSocket(level: Level, script: (item: SayItem | CatchItem, i: number) => { tools: [string, Record<string, unknown>, Record<string, unknown>][]; say?: string; check?: Record<string, unknown> }) {
  let state: PlayState = playReducer(initialPlay(level), { type: "start" });
  const closed: RoundClosed[] = [];
  const ctl = new LevelController(level, chunks, now, (c) => {
    closed.push(c);
    state = playReducer(state, { type: "round", report: c.report, now: "2026-09-30T00:00:00.000Z" });
  });
  const cfg = { system_prompt: "s", greeting: "g", tools: [], keyterms: [], language_codes: ["en"], transcription_mode: "balanced", turn_detection: {} } as never;
  const socket = openOralSocket({
    config: cfg,
    subjectId: "sub",
    getToken: async () => "tok",
    runTool: async (name, args) => {
      const step = script(ctl.item!, ctl.index).tools.find((t) => t[0] === name);
      const result = step ? step[2] : {};
      ctl.tool(name, args, result);
      return result;
    },
    openSocket: (url) => new FakeWS(url) as unknown as WebSocket,
    playAudio: () => {},
    flushAudio: () => {},
    onState: () => {},
    onTranscript: (text, speaker) => speaker === "user" && ctl.speech(text),
    onError: () => {},
    onEnded: () => {},
  });
  await tick();
  const ws = FakeWS.last;
  ws.onopen?.({});
  ws.emit({ type: "session.ready", session_id: "s1", resume_token: "rt" });
  let call = 0;
  while (state.phase === "live" && ctl.index < level.rounds) {
    const i = ctl.index;
    const step = script(ctl.item!, i);
    // A catch claim is page-checked as soon as it is shown; the check is in the draft before the player speaks.
    if (step.check) ctl.tool("verify_claim", { claim: (ctl.item as CatchItem).claim }, step.check);
    if (step.say) ws.emit({ type: "transcript.user", item_id: `u${i}`, text: step.say });
    for (const [name, args] of step.tools) ws.emit({ type: "tool.call", call_id: `c${call++}`, name, arguments: args });
    await tick();
    ws.emit({ type: "reply.done", status: "completed" });
    await tick();
    if (ctl.index === i) break;
  }
  void socket;
  return { state, closed, ws };
}

describe("a level played through the real socket client", () => {
  it("wins a say level: each grade closes a round, hearts hold, proofs collect, stars and XP come from the engine", async () => {
    const level = sayLevel;
    const { state, closed } = await playThroughSocket(level, (item, i) => {
      const it = item as SayItem;
      const pid = "ch_sa_1";
      return {
        tools: [
          ["verify_claim", { claim: `answer ${i}`, concept: it.conceptId }, { verdict: "supported", quote: quoteOf(pid), page: 4, passage_id: pid }],
          ["grade_my_answer", { question: it.question, answer: `answer ${i}` }, { verdict: "correct" }],
        ],
      };
    });
    expect(closed).toHaveLength(level.rounds);
    expect(state.phase).toBe("won");
    expect(state.run.hearts).toBe(level.hearts);
    expect(state.proofs).toHaveLength(1);
    const { result } = finishLevel(state.run, { playedAt: "2026-09-30T00:00:00.000Z" });
    expect(result.stars).toBe(3);
    expect(result.xp).toBeGreaterThan(100 * level.rounds);
  });

  it("loses a say level after the hearts run out and pays nothing", async () => {
    const level = { ...sayLevel, rounds: 5, hearts: 3, items: [...sayLevel.items!, ...sayLevel.items!, ...sayLevel.items!].slice(0, 5) } as Level;
    const { state } = await playThroughSocket(level, () => ({ tools: [["grade_my_answer", {}, { verdict: "incorrect" }]] }));
    expect(state.phase).toBe("lost");
    expect(state.run.hearts).toBe(0);
    expect(finishLevel(state.run, { playedAt: "t" }).result.xp).toBe(0);
  });

  it("plays a catch level by voice: the words set the stance, the outcome follows the flag", async () => {
    const level = catchLevel;
    const { state, closed } = await playThroughSocket(level, (item) => {
      const it = item as CatchItem;
      return { say: it.isBluff ? "that is a bluff" : "that is true", tools: [], check: { verdict: it.isBluff ? "contradicted" : "supported", quote: quoteOf(it.passageId), page: it.page, passage_id: it.passageId } };
    });
    expect(closed.map((c) => c.report.outcome).every((o) => o === "bluff_caught" || o === "correct")).toBe(true);
    expect(state.phase).toBe("won");
    expect(state.run.bestCombo).toBe(level.rounds);
  });

  it("a claim round with no page check yet does not close on the stance alone", async () => {
    const { closed } = await playThroughSocket(catchLevel, () => ({ say: "that is true", tools: [] }));
    expect(closed).toHaveLength(0);
  });

  it("a wrong call on a bluff costs a heart", async () => {
    const level = catchLevel;
    const { state } = await playThroughSocket(level, (item) => {
      const it = item as CatchItem;
      return { say: "that is true", tools: [], check: { verdict: it.isBluff ? "contradicted" : "supported", quote: quoteOf(it.passageId), page: it.page, passage_id: it.passageId } };
    });
    expect(state.run.rounds).toContain("bluff_missed");
    expect(state.run.hearts).toBeLessThan(level.hearts);
  });
});
