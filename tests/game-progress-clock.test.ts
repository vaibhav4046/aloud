import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetLimits } from "@/lib/limits";
import type { Level, LevelResult, Progress, ProofCard, Run } from "@/lib/game/types";
import { FileEventStore } from "@/lib/store/file";
import { scoreLevel } from "@/lib/game/scoring";
import { dailyGoalFraction, streakStatus } from "@/lib/game/progress";

/**
 * Streak past day one, freeze earning and spending, and the daily-goal ring, through the real
 * /api/game/progress route with the clock injected (Date is faked; the route reads new Date()).
 * Same harness as game-api.test.ts: /api/game/run and /api/game/progress against a real file store in a temp
 * directory. The identity cookie is the boundary, so the cookie jar is the one
 * thing mocked: each case names whose browser is asking.
 */

const jar = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "viva_did" && jar.value !== undefined ? { name, value: jar.value } : undefined) }),
}));

const run = await import("@/app/api/game/run/route");
const progress = await import("@/app/api/game/progress/route");

/** A fresh pair of browsers per test, so one case never inherits another's stored run or progress. */
let seq = 0;
const hex32 = (n: number) => n.toString(16).padStart(32, "0");
let DID_A = hex32(1);
let DID_B = hex32(2);
let USER_A = `demo_${DID_A}`;
const SAMPLE = "course_transformers_w4";

let tmp: string;
beforeAll(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "aloud-game-api-"));
  process.env.DATA_DIR = tmp;
});
afterAll(async () => {
  delete process.env.DATA_DIR;
  await fs.rm(tmp, { recursive: true, force: true });
});
beforeEach(() => {
  seq += 1;
  DID_A = hex32(seq * 2);
  DID_B = hex32(seq * 2 + 1);
  USER_A = `demo_${DID_A}`;
  jar.value = DID_A;
  __resetLimits();
});

const url = (p: string, q = "") => `http://localhost${p}${q}`;
const getRun = (q = `?subjectId=${SAMPLE}`, ip = "10.0.0.1") => run.GET(new Request(url("/api/game/run", q), { headers: { "x-forwarded-for": ip } }));
const postRun = (body: unknown, ip = "10.0.0.1") => run.POST(new Request(url("/api/game/run"), { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: typeof body === "string" ? body : JSON.stringify(body) }));
const getProgress = (q = `?subjectId=${SAMPLE}`, ip = "10.0.0.1") => progress.GET(new Request(url("/api/game/progress", q), { headers: { "x-forwarded-for": ip } }));
const postProgress = (body: unknown, headers: Record<string, string> = {}, ip = "10.0.0.1") =>
  progress.POST(new Request(url("/api/game/progress"), { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip, ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) }));

async function json<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

/** A result a real play of the level could have produced: every round correct and not page-checked, scored by the engine. */
function result(level: Level, over: Partial<LevelResult> = {}): LevelResult {
  const rounds = Array.from({ length: level.rounds }, () => "correct" as const);
  const played = scoreLevel({ id: level.id, kind: level.kind ?? "say", hearts: level.hearts, rounds: level.rounds }, rounds.map((outcome) => ({ conceptId: "c", outcome, grounded: false, ms: 0 })), { playedAt: "2026-09-30T10:00:00.000Z" }).result;
  return { ...played, ms: 90_000, missedConceptIds: [], clearedConceptIds: [], ...over };
}

const errCode = async (res: Response) => (await json<{ error: { code: string } }>(res)).error.code;


const DAY = 86_400_000;
const at = (iso: string) => vi.setSystemTime(new Date(iso));
beforeEach(() => vi.useFakeTimers({ toFake: ["Date"] }));
afterEach(() => vi.useRealTimers());

/** Win level `i` of the run on the clock's current day. The next level opens once this one is won. */
async function winLevel(levels: Level[], i: number, tz = "UTC", over: Partial<LevelResult> = {}): Promise<Progress> {
  const res = await postProgress({ subjectId: SAMPLE, tz, result: result(levels[i], over) });
  expect(res.status, `level ${i}`).toBe(200);
  return (await json<{ progress: Progress }>(res)).progress;
}

async function levelsOf(): Promise<Level[]> {
  return (await json<{ run: Run }>(await getRun())).run.levels;
}

describe("streak through the progress route", () => {
  it("counts consecutive days past day one and pays a freeze at day 7", async () => {
    at("2026-10-01T09:00:00Z");
    const levels = await levelsOf();
    const seen: number[] = [];
    let p!: Progress;
    for (let d = 0; d < 7; d++) {
      at(new Date(Date.parse("2026-10-01T09:00:00Z") + d * DAY).toISOString());
      p = await winLevel(levels, d);
      seen.push(p.streakDays);
    }
    expect(seen).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(p.freezes).toBe(1);
    expect(p.lastPlayedDay).toBe("2026-10-07");
  });

  it("does not change the streak for a second level on the same day", async () => {
    at("2026-10-01T09:00:00Z");
    const levels = await levelsOf();
    await winLevel(levels, 0);
    at("2026-10-02T09:00:00Z");
    const one = await winLevel(levels, 1);
    at("2026-10-02T21:00:00Z");
    const two = await winLevel(levels, 2);
    expect(one.streakDays).toBe(2);
    expect(two.streakDays).toBe(2);
  });

  it("spends a freeze to cross one missed day and keeps the streak", async () => {
    const levels = await levelsOf();
    let p!: Progress;
    for (let d = 0; d < 7; d++) {
      at(new Date(Date.parse("2026-10-01T09:00:00Z") + d * DAY).toISOString());
      p = await winLevel(levels, d);
    }
    expect(p.freezes).toBe(1);
    at("2026-10-09T09:00:00Z"); // day 8 (Oct 8) is missed
    p = await winLevel(levels, 7);
    expect(p.streakDays).toBe(8);
    expect(p.freezes).toBe(0);
    expect(p.freezesSpent).toBe(1);
  });

  it("resets to 1 and spends nothing when the gap is longer than the freezes cover", async () => {
    const levels = await levelsOf();
    let p!: Progress;
    for (let d = 0; d < 7; d++) {
      at(new Date(Date.parse("2026-10-01T09:00:00Z") + d * DAY).toISOString());
      p = await winLevel(levels, d);
    }
    expect(p.freezes).toBe(1);
    at("2026-10-11T09:00:00Z"); // Oct 8, 9, 10 missed: three days, one freeze
    p = await winLevel(levels, 7);
    expect(p.streakDays).toBe(1);
    expect(p.freezes).toBe(1);
    expect(p.freezesSpent ?? 0).toBe(0);
  });

  it("reads the streak as broken on a later GET without changing what is stored", async () => {
    at("2026-10-01T09:00:00Z");
    const levels = await levelsOf();
    await winLevel(levels, 0);
    at("2026-10-02T09:00:00Z");
    const { progress: p } = await json<{ progress: Progress }>(await getProgress());
    expect(streakStatus(p, { now: new Date(), tz: "UTC" })).toMatchObject({ days: 1, state: "at_risk", playedToday: false });
    at("2026-10-05T09:00:00Z");
    const { progress: later } = await json<{ progress: Progress }>(await getProgress());
    expect(streakStatus(later, { now: new Date(), tz: "UTC" })).toMatchObject({ days: 0, state: "broken" });
    expect(later.streakDays).toBe(1);
  });

  it("takes the day from the zone the player named: 23:30 UTC is already the next day in London", async () => {
    at("2026-09-30T23:30:00Z");
    const levels = await levelsOf();
    const p = await winLevel(levels, 0, "Europe/London");
    expect(p.lastPlayedDay).toBe("2026-10-01");
  });
});

describe("daily-goal ring through the progress route", () => {
  it("adds the minutes a level took, accumulates on the same day and starts over the next day", async () => {
    at("2026-10-01T09:00:00Z");
    const levels = await levelsOf();
    let p = await winLevel(levels, 0, "UTC", { ms: 90_000 });
    expect(p.todayMinutes).toBe(1.5);
    expect(p.todayDay).toBe("2026-10-01");
    at("2026-10-01T15:00:00Z");
    p = await winLevel(levels, 1, "UTC", { ms: 45_000 });
    expect(p.todayMinutes).toBe(2.25);
    expect(dailyGoalFraction(p, { now: new Date(), tz: "UTC" })).toBeCloseTo(2.25 / p.dailyGoalMinutes, 5);
    at("2026-10-02T08:00:00Z");
    const { progress: next } = await json<{ progress: Progress }>(await getProgress());
    expect(dailyGoalFraction(next, { now: new Date(), tz: "UTC" })).toBe(0);
    p = await winLevel(levels, 2, "UTC", { ms: 30_000 });
    expect(p.todayMinutes).toBe(0.5);
    expect(p.todayDay).toBe("2026-10-02");
  });

  it("caps the ring at 1 once the goal is met", async () => {
    at("2026-10-01T09:00:00Z");
    const levels = await levelsOf();
    const p = await winLevel(levels, 0, "UTC", { ms: 20 * 60_000 });
    expect(dailyGoalFraction(p, { now: new Date(), tz: "UTC" })).toBe(1);
  });
});
