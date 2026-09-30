import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetLimits } from "@/lib/limits";
import { COURSES } from "@/lib/courses";
import { generateRun } from "@/lib/game/run";
import { applyRound, scoreLevel, startLevel } from "@/lib/game/scoring";
import { leaveResult } from "@/components/game/engine-port";
import { checkResultByReplay, streakFromResults } from "@/lib/game/trust";
import type { Level, LevelResult, Progress, ProofCard, Run, RoundOutcome } from "@/lib/game/types";
import { FileEventStore } from "@/lib/store/file";

/**
 * What the server believes from a browser. Each round is graded in the browser,
 * so a report is checked for being something the level could have produced, and
 * XP, rank, streak and freezes are derived from results rather than accepted.
 */

const jar = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "viva_did" && jar.value !== undefined ? { name, value: jar.value } : undefined) }),
}));

const runRoute = await import("@/app/api/game/run/route");
const progressRoute = await import("@/app/api/game/progress/route");

const SAMPLE = "course_transformers_w4";
let seq = 9_000;
let DID = "";
let USER = "";
let tmp: string;
beforeAll(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "aloud-trust-"));
  process.env.DATA_DIR = tmp;
});
afterAll(async () => {
  delete process.env.DATA_DIR;
  await fs.rm(tmp, { recursive: true, force: true });
});
beforeEach(() => {
  seq += 1;
  DID = seq.toString(16).padStart(32, "0");
  USER = `demo_${DID}`;
  jar.value = DID;
  __resetLimits();
});

const ip = () => ({ "x-forwarded-for": `10.5.${seq % 250}.1` });
const getRun = async (): Promise<Run> => ((await (await runRoute.GET(new Request(`http://localhost/api/game/run?subjectId=${SAMPLE}`, { headers: ip() }))).json()) as { run: Run }).run;
const getProgress = async (): Promise<Progress> => ((await (await progressRoute.GET(new Request(`http://localhost/api/game/progress?subjectId=${SAMPLE}`, { headers: ip() }))).json()) as { progress: Progress }).progress;
const post = (body: unknown) =>
  progressRoute.POST(new Request("http://localhost/api/game/progress", { method: "POST", headers: { "content-type": "application/json", ...ip() }, body: JSON.stringify(body) }));

const asPlayed = (level: Level, rounds: RoundOutcome[], grounded = false, playedAt = "2026-09-30T10:00:00.000Z"): LevelResult =>
  scoreLevel(level, rounds.map((outcome) => ({ conceptId: "c", outcome, grounded, ms: 0 })), { playedAt }).result;
const allCorrect = (level: Level, playedAt?: string): LevelResult =>
  asPlayed(level, Array.from({ length: level.rounds }, () => "correct" as const), false, playedAt);

describe("a result must follow from its rounds", () => {
  const run = generateRun(COURSES[SAMPLE] as never, { now: "2026-09-30T00:00:00.000Z" });
  const level = run.levels[0];
  const honest = allCorrect(level);

  it("accepts what the engine would have produced, with or without page checks", () => {
    expect(checkResultByReplay(honest, level)).toBeNull();
    expect(checkResultByReplay(asPlayed(level, honest.rounds, true), level)).toBeNull();
  });

  it.each([
    ["more stars than the rounds earn", { rounds: ["correct", "incorrect"] as RoundOutcome[], stars: 3 as const }],
    ["XP above the most the rounds can pay", { xp: honest.xp + 200 }],
    ["XP below the least the rounds pay", { xp: 1 }],
    ["a win that ran out of hearts", { rounds: ["incorrect", "incorrect"] as RoundOutcome[], stars: 1 as const, heartsLeft: 1 }],
    ["a won level short of its rounds", { rounds: ["correct"] as RoundOutcome[] }],
    ["hearts that do not match the misses", { heartsLeft: level.hearts - 1 }],
    ["a combo the rounds never reached", { bestCombo: 9 }],
    ["a quit reported as won", { outcome: "quit" as const, stars: 0 as const, xp: 0, rounds: ["correct"] as RoundOutcome[] }],
  ])("refuses %s", (_name, over) => {
    expect(checkResultByReplay({ ...honest, ...over }, level)).not.toBeNull();
  });

  it("accepts a lost level and a quit level as scored", () => {
    const lost = asPlayed(level, ["incorrect", "incorrect"]);
    expect(lost.outcome).toBe("lost");
    expect(checkResultByReplay(lost, level)).toBeNull();
    const quit = asPlayed(level, ["correct"]);
    expect(quit.outcome).toBe("quit");
    expect(checkResultByReplay(quit, level)).toBeNull();
  });
});

describe("POST /api/game/progress, one result", () => {
  it("answers 400 for a result the rounds do not support, and stores nothing", async () => {
    const level = (await getRun()).levels[0];
    const bad = { ...allCorrect(level), rounds: ["correct", "incorrect"] as RoundOutcome[] };
    expect((await post({ subjectId: SAMPLE, result: bad })).status).toBe(400);
    expect((await post({ subjectId: SAMPLE, result: { ...allCorrect(level), xp: 999 } })).status).toBe(400);
    expect((await getProgress()).results).toEqual({});
  });

  it("answers 400 for a level that is still locked", async () => {
    const run = await getRun();
    const locked = run.levels[4];
    expect(locked.index).toBeGreaterThan(1);
    const res = await post({ subjectId: SAMPLE, result: allCorrect(locked) });
    expect(res.status).toBe(400);
    expect(JSON.stringify(await res.json())).toContain("locked");
  });

  it("takes an honest result, then the next level opens", async () => {
    const run = await getRun();
    expect((await post({ subjectId: SAMPLE, result: allCorrect(run.levels[0]) })).status).toBe(200);
    expect((await post({ subjectId: SAMPLE, result: allCorrect(run.levels[1]) })).status).toBe(200);
  });
});

describe("POST /api/game/progress, a device copy", () => {
  it("ignores the totals in it: xp, rank, streak and freezes come from its results", async () => {
    const base = await getProgress();
    const inflated: Progress = {
      ...base, xp: 900_000, rank: 30, streakDays: 400, lastPlayedDay: "2026-09-30", freezes: 2, freezesEarned: 90, freezesSpent: 0, crateXp: 500_000,
      updatedAt: new Date(Date.now() + 5_000).toISOString(),
    };
    const res = await post({ subjectId: SAMPLE, progress: inflated });
    expect(res.status).toBe(200);
    const { progress: p } = (await res.json()) as { progress: Progress };
    expect(p.xp).toBe(60);
    expect(p.rank).toBe(1);
    expect(p.streakDays).toBe(0);
    expect(p.freezes).toBe(0);
    expect(p.crateXp).toBe(0);
  });

  it("keeps XP the results paid, and crate XP up to one crate per won level", async () => {
    const run = await getRun();
    const l1 = allCorrect(run.levels[0]);
    const base = await getProgress();
    const device: Progress = { ...base, results: { [l1.levelId]: l1 }, crateXp: 5_000, updatedAt: new Date(Date.now() + 5_000).toISOString() };
    const { progress: p } = (await (await post({ subjectId: SAMPLE, progress: device })).json()) as { progress: Progress };
    expect(p.xp).toBe(60 + l1.xp + 50);
    expect(p.crateXp).toBe(50);
  });

  it("drops results the rounds do not support, and proofs whose quote is not on the page", async () => {
    const run = await getRun();
    const l1 = allCorrect(run.levels[0]);
    const forgedResult = { ...allCorrect(run.levels[1]), xp: 999 };
    const fake: ProofCard = { id: "p_fake", conceptId: "c", quote: "A sentence that appears on no page at all.", page: 1, passageId: "ch_sa_1", levelId: l1.levelId, earnedAt: "2026-09-30T10:00:00.000Z" };
    const base = await getProgress();
    const device: Progress = { ...base, results: { [l1.levelId]: l1, [forgedResult.levelId]: forgedResult }, proofs: [fake], updatedAt: new Date(Date.now() + 5_000).toISOString() };
    const { progress: p } = (await (await post({ subjectId: SAMPLE, progress: device })).json()) as { progress: Progress };
    expect(Object.keys(p.results)).toEqual([l1.levelId]);
    expect(p.proofs).toEqual([]);
  });

  it("keeps a proof whose quote is verbatim on the page it names", async () => {
    const run = await getRun();
    const l1 = allCorrect(run.levels[0]);
    const chunk = COURSES[SAMPLE].sources[0].chunks[0];
    const quote = chunk.text.split(/(?<=[.!?])\s+/)[0];
    const real: ProofCard = { id: "p_real", conceptId: "c", quote, page: chunk.locator.page ?? null, passageId: chunk.id, levelId: l1.levelId, earnedAt: "2026-09-30T10:00:00.000Z" };
    const base = await getProgress();
    const device: Progress = { ...base, results: { [l1.levelId]: l1 }, proofs: [real], updatedAt: new Date(Date.now() + 5_000).toISOString() };
    const { progress: p } = (await (await post({ subjectId: SAMPLE, progress: device })).json()) as { progress: Progress };
    expect(p.proofs.map((c) => c.id)).toEqual(["p_real"]);
  });
});

describe("streakFromResults", () => {
  const at = new Date("2026-09-30T12:00:00.000Z");
  const won = (day: string): LevelResult => ({ levelId: `l_${day}`, stars: 3, xp: 100, heartsLeft: 3, bestCombo: 1, rounds: [], proofIds: [], outcome: "won", playedAt: `${day}T10:00:00.000Z` });
  const byDay = (...days: string[]) => Object.fromEntries(days.map((d) => [`l_${d}`, won(d)]));

  it("counts consecutive played days ending at the latest, and never counts a future day", () => {
    expect(streakFromResults(byDay("2026-09-28", "2026-09-29", "2026-09-30"), { now: at })).toEqual({ streakDays: 3, lastPlayedDay: "2026-09-30" });
    expect(streakFromResults(byDay("2026-09-25", "2026-09-29", "2026-09-30"), { now: at })).toEqual({ streakDays: 2, lastPlayedDay: "2026-09-30" });
    expect(streakFromResults(byDay("2026-09-30", "2027-01-01"), { now: at })).toEqual({ streakDays: 1, lastPlayedDay: "2026-09-30" });
    expect(streakFromResults({}, { now: at })).toEqual({ streakDays: 0, lastPlayedDay: null });
  });
});

describe("results for levels that are not in the run", () => {
  it("are dropped when progress is read and when a device copy is merged, and their XP stays", async () => {
    const run = await getRun();
    const l1 = allCorrect(run.levels[0]);
    expect((await post({ subjectId: SAMPLE, result: l1 })).status).toBe(200);
    const store = new FileEventStore();
    const stored = (await store.getGameDoc(USER, `progress:${SAMPLE}`)) as Progress;
    const ghost = { ...l1, levelId: "l_ghost_1" };
    await store.putGameDoc(USER, `progress:${SAMPLE}`, { ...stored, results: { ...stored.results, l_ghost_1: ghost } });
    const read = await getProgress();
    expect(Object.keys(read.results)).toEqual([l1.levelId]);
    expect(read.xp).toBe(stored.xp);
    const { progress: merged } = (await (await post({ subjectId: SAMPLE, progress: read })).json()) as { progress: Progress };
    expect(Object.keys(merged.results)).toEqual([l1.levelId]);
    const after = (await store.getGameDoc(USER, `progress:${SAMPLE}`)) as Progress;
    expect(Object.keys(after.results)).toEqual([l1.levelId]);
  });
});

describe("stored progress that no longer parses", () => {
  it("is kept under a backup key before a fresh copy replaces it", async () => {
    const run = await getRun();
    const store = new FileEventStore();
    const garbage = { runId: `run_${SAMPLE}`, xp: "lots", results: 7 };
    await store.putGameDoc(USER, `progress:${SAMPLE}`, garbage);
    expect((await post({ subjectId: SAMPLE, result: allCorrect(run.levels[0]) })).status).toBe(200);
    expect(await store.getGameDoc(USER, `progress:${SAMPLE}.unreadable`)).toEqual(garbage);
    const p = (await store.getGameDoc(USER, `progress:${SAMPLE}`)) as Progress;
    expect(typeof p.xp).toBe("number");
  });
});

describe("leaving a level in the middle", () => {
  const run = generateRun(COURSES[SAMPLE] as never, { now: "2026-09-30T00:00:00.000Z" });
  const level = run.levels[0];
  const chunk = COURSES[SAMPLE].sources[0].chunks[0];
  const quote = chunk.text.split(/(?<=[.!?])\s+/)[0];
  const midway = () => {
    let r = startLevel(level);
    r = applyRound(r, { conceptId: level.conceptIds[0], outcome: "correct", grounded: true, ms: 40_000, proof: { conceptId: level.conceptIds[0], quote, page: chunk.locator.page ?? null, passageId: chunk.id } }).run;
    return r;
  };

  it("yields a quit result with the proofs and play time so far, and no stars or XP", () => {
    const left = leaveResult(midway(), "2026-09-30T10:05:00.000Z")!;
    expect(left.result).toMatchObject({ outcome: "quit", stars: 0, xp: 0, ms: 40_000 });
    expect(left.result.rounds).toEqual(["correct"]);
    expect(left.proofs).toHaveLength(1);
  });

  it("yields nothing when no round was closed or the level already ended", () => {
    expect(leaveResult(startLevel(level), "t")).toBeNull();
    let done = startLevel(level);
    for (let i = 0; i < level.rounds; i++) done = applyRound(done, { conceptId: "c", outcome: "correct", grounded: false, ms: 0 }).run;
    expect(leaveResult(done, "t")).toBeNull();
  });

  it("is accepted by the server, which keeps the proof card and the minutes without paying XP", async () => {
    const live = await getRun();
    const left = leaveResult(midway(), new Date().toISOString())!;
    const res = await post({ subjectId: SAMPLE, result: left.result, proofs: left.proofs });
    expect(res.status).toBe(200);
    const { progress: p } = (await res.json()) as { progress: Progress };
    expect(p.proofs.map((c) => c.quote)).toEqual([quote]);
    expect(p.todayMinutes).toBeGreaterThan(0);
    expect(p.xp).toBe(60);
    expect(p.unlockedIndex).toBe(1);
    expect(p.results[live.levels[0].id].outcome).toBe("quit");
  });
});
