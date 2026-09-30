import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetLimits } from "@/lib/limits";
import type { Level, LevelResult, Progress, ProofCard, Run } from "@/lib/game/types";
import { FileEventStore } from "@/lib/store/file";
import { ownedSubject } from "./game-fixtures";

/**
 * /api/game/run and /api/game/progress against a real file store in a temp
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

function result(level: Level, over: Partial<LevelResult> = {}): LevelResult {
  return {
    levelId: level.id, stars: 3, xp: 200, heartsLeft: level.hearts, bestCombo: 2, rounds: Array.from({ length: level.rounds }, () => "correct" as const),
    proofIds: [], outcome: "won", playedAt: "2026-09-30T10:00:00.000Z", ms: 90_000, missedConceptIds: [], clearedConceptIds: [], ...over,
  };
}

const errCode = async (res: Response) => (await json<{ error: { code: string } }>(res)).error.code;

describe("GET /api/game/run", () => {
  it("builds and stores a run on first use and returns the same one afterwards", async () => {
    const first = await getRun();
    expect(first.status).toBe(200);
    expect(first.headers.get("cache-control")).toBe("no-store");
    const a = await json<{ run: Run; created: boolean }>(first);
    expect(a.created).toBe(true);
    expect(a.run.size).toBeGreaterThanOrEqual(12);
    expect(a.run.size).toBeLessThanOrEqual(30);
    const b = await json<{ run: Run; created: boolean }>(await getRun());
    expect(b.created).toBe(false);
    expect(b.run).toEqual(a.run);
  });

  it("defaults to the sample course when no subject is named", async () => {
    const res = await json<{ run: Run }>(await getRun(""));
    expect(res.run.subjectId).toBe(SAMPLE);
  });

  it("answers 404 for a subject that does not exist, with the existing error envelope", async () => {
    const res = await getRun("?subjectId=subj_nowhere");
    expect(res.status).toBe(404);
    expect(await errCode(res)).toBe("SUBJECT_NOT_FOUND");
  });

  it("rejects a subject id that is far too long", async () => {
    expect((await getRun(`?subjectId=${"x".repeat(200)}`)).status).toBe(400);
  });

  it("serves a learner's own subject to them and 404s it for everyone else", async () => {
    const store = new FileEventStore();
    await store.saveSubject(USER_A, ownedSubject(USER_A, "subj_a_notes"));
    const mine = await getRun("?subjectId=subj_a_notes");
    expect(mine.status).toBe(200);
    expect((await json<{ run: Run }>(mine)).run.subjectId).toBe("subj_a_notes");
    jar.value = DID_B;
    const theirs = await getRun("?subjectId=subj_a_notes");
    expect(theirs.status).toBe(404);
    expect(await errCode(theirs)).toBe("SUBJECT_NOT_FOUND");
  });

  it("keeps each identity's stored run separate", async () => {
    await getRun();
    const store = new FileEventStore();
    expect(await store.getGameDoc(USER_A, `run:${SAMPLE}`)).not.toBeNull();
    expect(await store.getGameDoc(`demo_${DID_B}`, `run:${SAMPLE}`)).toBeNull();
    jar.value = DID_B;
    const b = await json<{ created: boolean }>(await getRun());
    expect(b.created).toBe(true);
  });

  it("mints an identity cookie for a caller with none", async () => {
    jar.value = undefined;
    const res = await getRun();
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toMatch(/viva_did=[0-9a-f]{32}/);
  });
});

describe("POST /api/game/run", () => {
  it("regenerates from the current material and keeps level ids stable", async () => {
    const first = await json<{ run: Run }>(await getRun());
    const again = await postRun({ subjectId: SAMPLE, regenerate: true });
    expect(again.status).toBe(200);
    const body = await json<{ run: Run; created: boolean }>(again);
    expect(body.created).toBe(true);
    expect(body.run.levels.map((l) => l.id)).toEqual(first.run.levels.map((l) => l.id));
  });

  it("does not rebuild without regenerate", async () => {
    await getRun();
    const body = await json<{ created: boolean }>(await postRun({ subjectId: SAMPLE }));
    expect(body.created).toBe(false);
  });

  it("refuses malformed bodies", async () => {
    for (const bad of ["not json", "[]", { subjectId: 5 }, { regenerate: "yes" }, { subjectId: "x".repeat(200) }]) {
      const res = await postRun(bad as never);
      expect(res.status, JSON.stringify(bad)).toBe(400);
    }
  });

  it("refuses a body over the size cap, declared or actual", async () => {
    const big = JSON.stringify({ subjectId: SAMPLE, pad: "a".repeat(70_000) });
    expect((await postRun(big)).status).toBe(413);
    const lying = await run.POST(new Request(url("/api/game/run"), { method: "POST", headers: { "content-length": "999999", "content-type": "application/json" }, body: "{}" }));
    expect(lying.status).toBe(413);
  });

  it("rate limits a burst of regenerate calls per address", async () => {
    let limited = 0;
    for (let i = 0; i < 40; i++) if ((await postRun({ subjectId: SAMPLE }, "10.9.9.9")).status === 429) limited += 1;
    expect(limited).toBeGreaterThan(0);
    const res = await postRun({ subjectId: SAMPLE }, "10.9.9.9");
    expect(res.headers.get("retry-after")).toBeTruthy();
  });
});

describe("GET /api/game/progress", () => {
  it("returns a fresh endowed progress that is marked not persisted", async () => {
    const res = await json<{ progress: Progress; persisted: boolean }>(await getProgress());
    expect(res.persisted).toBe(false);
    expect(res.progress.xp).toBe(60);
    expect(res.progress.unlockedIndex).toBe(1);
    expect(res.progress.runId).toBe(`run_${SAMPLE}`);
  });

  it("404s a subject the caller does not own", async () => {
    const store = new FileEventStore();
    await store.saveSubject(USER_A, ownedSubject(USER_A, "subj_a_private"));
    jar.value = DID_B;
    expect((await getProgress("?subjectId=subj_a_private")).status).toBe(404);
  });
});

describe("POST /api/game/progress, one finished level", () => {
  async function firstLevel(): Promise<Level> {
    return (await json<{ run: Run }>(await getRun())).run.levels[0];
  }

  it("applies a result, stores it and serves it back", async () => {
    const level = await firstLevel();
    const res = await postProgress({ subjectId: SAMPLE, tz: "Europe/London", result: result(level) });
    expect(res.status).toBe(200);
    const { progress: p } = await json<{ progress: Progress }>(res);
    expect(p.xp).toBe(260);
    expect(p.results[level.id].stars).toBe(3);
    expect(p.unlockedIndex).toBe(2);
    expect(p.streakDays).toBe(1);
    const back = await json<{ progress: Progress; persisted: boolean }>(await getProgress());
    expect(back.persisted).toBe(true);
    expect(back.progress.xp).toBe(260);
  });

  it("is idempotent: the same body twice leaves the same progress", async () => {
    const level = await firstLevel();
    const body = { subjectId: SAMPLE, tz: "UTC", result: result(level) };
    const one = await json<{ progress: Progress }>(await postProgress(body));
    const two = await json<{ progress: Progress }>(await postProgress(body));
    expect(two.progress).toEqual(one.progress);
    expect(two.progress.xp).toBe(260);
  });

  it("uses the server clock for the streak day, not anything the client claims", async () => {
    const level = await firstLevel();
    const { progress: p } = await json<{ progress: Progress }>(await postProgress({ subjectId: SAMPLE, result: result(level, { playedAt: "2001-01-01T00:00:00.000Z" }) }));
    expect(p.lastPlayedDay).toBe(new Date().toISOString().slice(0, 10));
  });

  it("refuses results the level cannot have produced", async () => {
    const level = await firstLevel();
    const cases: LevelResult[] = [
      result(level, { levelId: "l_not_in_run" }),
      result(level, { xp: 5000 }),
      result(level, { rounds: Array.from({ length: level.rounds + 3 }, () => "correct" as const) }),
      result(level, { heartsLeft: 4 }),
      result(level, { stars: 0 }),
      result(level, { outcome: "lost", stars: 2, xp: 0 }),
      result(level, { outcome: "quit", stars: 0, xp: 50 }),
    ];
    for (const bad of cases) {
      const res = await postProgress({ subjectId: SAMPLE, result: bad });
      expect(res.status, JSON.stringify(bad)).toBe(400);
    }
    const stored = await json<{ persisted: boolean }>(await getProgress());
    expect(stored.persisted).toBe(false);
  });

  it("refuses malformed bodies", async () => {
    const level = await firstLevel();
    const good = result(level);
    const bad: unknown[] = [
      "not json",
      {},
      { subjectId: SAMPLE },
      { subjectId: SAMPLE, result: { levelId: "x" } },
      { subjectId: SAMPLE, result: { ...good, xp: -1 } },
      { subjectId: SAMPLE, result: { ...good, xp: 1.5 } },
      { subjectId: SAMPLE, result: { ...good, stars: 4 } },
      { subjectId: SAMPLE, result: { ...good, outcome: "cheated" } },
      { subjectId: SAMPLE, result: { ...good, rounds: ["correct", "sneaky"] } },
      { subjectId: SAMPLE, result: { ...good, levelId: "x".repeat(500) } },
      { subjectId: SAMPLE, result: good, tz: "../../etc/passwd" },
      { subjectId: SAMPLE, result: good, proofs: Array.from({ length: 50 }, () => ({})) },
    ];
    for (const b of bad) {
      const res = await postProgress(b as never);
      expect(res.status, JSON.stringify(b).slice(0, 80)).toBe(400);
    }
    expect((await postProgress(JSON.stringify({ subjectId: SAMPLE, pad: "a".repeat(70_000) }))).status).toBe(413);
  });

  it("stores a proof card only when its quote is verbatim in the passage it names", async () => {
    const level = await firstLevel();
    const real: ProofCard = { id: "p_real", conceptId: "c_position", quote: "so by itself it cannot tell first from last", page: 11, passageId: "ch_pos_1", levelId: level.id, earnedAt: "2026-09-30T10:00:00.000Z" };
    const fake: ProofCard = { ...real, id: "p_fake", quote: "the passage says positional encodings are optional in every model" };
    const wrongPassage: ProofCard = { ...real, id: "p_wrong", passageId: "ch_mh_1" };
    const { progress: p } = await json<{ progress: Progress }>(await postProgress({ subjectId: SAMPLE, result: result(level), proofs: [real, fake, wrongPassage] }));
    expect(p.proofs.map((c) => c.id)).toEqual(["p_real"]);
    expect(p.proofs[0].levelId).toBe(level.id);
  });

  it("adds a recall level to the run once a concept is missed", async () => {
    const level = await firstLevel();
    await postProgress({ subjectId: SAMPLE, result: result(level, { missedConceptIds: ["c_position"] }) });
    const after = await json<{ run: Run }>(await getRun());
    const recall = after.run.levels.find((l) => l.kind === "recall");
    expect(recall?.conceptIds).toEqual(["c_position"]);
  });

  it("404s a subject that is another learner's", async () => {
    const store = new FileEventStore();
    await store.saveSubject(USER_A, ownedSubject(USER_A, "subj_a_post"));
    jar.value = DID_B;
    const res = await postProgress({ subjectId: "subj_a_post", result: result({ id: "l_say_c0_1", hearts: 3, rounds: 2 } as Level) });
    expect(res.status).toBe(404);
  });

  it("keeps each identity's progress separate", async () => {
    const level = await firstLevel();
    await postProgress({ subjectId: SAMPLE, result: result(level) });
    jar.value = DID_B;
    const b = await json<{ progress: Progress; persisted: boolean }>(await getProgress());
    expect(b.persisted).toBe(false);
    expect(b.progress.xp).toBe(60);
    const store = new FileEventStore();
    expect(await store.getGameDoc(`demo_${DID_B}`, `progress:${SAMPLE}`)).toBeNull();
  });

  it("rate limits a burst of posts", async () => {
    const level = await firstLevel();
    let limited = 0;
    for (let i = 0; i < 40; i++) {
      const res = await postProgress({ subjectId: SAMPLE, result: result(level, { playedAt: `2026-09-30T10:00:${String(i).padStart(2, "0")}.000Z` }) }, {}, "10.7.7.7");
      if (res.status === 429) limited += 1;
    }
    expect(limited).toBeGreaterThan(0);
  });
});

describe("POST /api/game/progress, merging a device copy", () => {
  it("merges a local copy into the stored one without losing either", async () => {
    const r = (await json<{ run: Run }>(await getRun())).run;
    const [l1, l2] = r.levels;
    await postProgress({ subjectId: SAMPLE, result: result(l1, { xp: 200 }) });
    const local: Progress = (await json<{ progress: Progress }>(await getProgress())).progress;
    const device: Progress = { ...local, xp: 60 + 150, results: { [l2.id]: result(l2, { xp: 150, playedAt: "2026-09-30T11:00:00.000Z" }) }, updatedAt: new Date(Date.now() + 1000).toISOString() };
    const res = await postProgress({ subjectId: SAMPLE, progress: device });
    expect(res.status).toBe(200);
    const { progress: m } = await json<{ progress: Progress }>(res);
    expect(Object.keys(m.results).sort()).toEqual([l1.id, l2.id].sort());
    expect(m.xp).toBe(60 + 200 + 150);
    expect(m.unlockedIndex).toBe(3);
  });

  it("drops results for levels that are not in the run and results a level cannot pay", async () => {
    const r = (await json<{ run: Run }>(await getRun())).run;
    const l1 = r.levels[0];
    const base = (await json<{ progress: Progress }>(await getProgress())).progress;
    const forged: Progress = {
      ...base,
      results: {
        [l1.id]: result(l1, { xp: 4000 }),
        l_ghost: result({ ...l1, id: "l_ghost" }, { xp: 100 }),
      },
    };
    const res = await postProgress({ subjectId: SAMPLE, progress: forged });
    expect(res.status).toBe(200);
    const { progress: m } = await json<{ progress: Progress }>(res);
    expect(m.results).toEqual({});
  });

  it("refuses a progress record that does not fit the schema", async () => {
    const base = (await json<{ progress: Progress }>(await getProgress())).progress;
    const bad: unknown[] = [
      { ...base, xp: -5 },
      { ...base, xp: 5_000_000 },
      { ...base, rank: 99 },
      { ...base, freezes: 50 },
      { ...base, lastPlayedDay: "yesterday" },
      { ...base, weakConceptIds: Array.from({ length: 40 }, (_, i) => `c${i}`) },
      { ...base, proofs: Array.from({ length: 400 }, (_, i) => ({ id: `p${i}` })) },
      { ...base, dailyGoalMinutes: 0 },
      { ...base, runId: undefined },
    ];
    for (const progressBody of bad) {
      const res = await postProgress({ subjectId: SAMPLE, progress: progressBody });
      expect(res.status, JSON.stringify(progressBody).slice(0, 60)).toBe(400);
    }
  });

  it("is idempotent", async () => {
    const base = (await json<{ progress: Progress }>(await getProgress())).progress;
    const one = await json<{ progress: Progress }>(await postProgress({ subjectId: SAMPLE, progress: base }));
    const two = await json<{ progress: Progress }>(await postProgress({ subjectId: SAMPLE, progress: one.progress }));
    expect(two.progress).toEqual(one.progress);
  });
});
