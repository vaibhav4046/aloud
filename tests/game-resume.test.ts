import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { COURSES } from "@/lib/courses";
import { generateRun } from "@/lib/game/run";
import type { CatchItem, SayItem } from "@/lib/game/types";
import { __resetLimits } from "@/lib/limits";
import { buildLevelPrompt, levelGreeting } from "@/lib/oral/prompt";
import { levelSessionUrl, sessionEndedView } from "@/components/game/resume";

/**
 * Reconnecting mid-level. The session used to reopen with the examiner on
 * item 1 while the screen was on round N, so the player was asked the
 * questions they had already answered.
 */

const jar = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "viva_did" && jar.value !== undefined ? { name, value: jar.value } : undefined) }),
}));

const sessionRoute = await import("@/app/api/oral/session/route");

const course = COURSES["course_transformers_w4"];
const run = generateRun(course);
const sayLevel = run.levels.find((l) => l.kind === "say" && l.rounds >= 2)!;
const catchLevel = run.levels.find((l) => l.kind === "catch")!;

let tmp: string;
beforeAll(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "aloud-resume-"));
  process.env.DATA_DIR = tmp;
});
afterAll(async () => {
  delete process.env.DATA_DIR;
  await fs.rm(tmp, { recursive: true, force: true });
});
let seq = 500;
beforeEach(() => {
  seq += 1;
  jar.value = seq.toString(16).padStart(32, "0");
  __resetLimits();
});

type Session = { system_prompt: string; greeting: string; levelFrom: number | null };
const get = (levelId: string, from?: number) =>
  sessionRoute.GET(new Request(`http://localhost${levelSessionUrl(course.id, levelId, from ?? 0)}`));

describe("GET /api/oral/session?from=", () => {
  it("opens on the item after the ones already played, and lists only the items left", async () => {
    const items = sayLevel.items as SayItem[];
    const s = (await (await get(sayLevel.id, 1)).json()) as Session;
    expect(s.levelFrom).toBe(1);
    expect(s.greeting).toContain(items[1].question);
    expect(s.greeting).not.toContain(items[0].question);
    expect(s.system_prompt).toContain(items[1].question);
    expect(s.system_prompt).not.toContain(`ITEM 1 (question): ${items[0].question}`);
    expect(s.system_prompt).toContain(`There are ${items.length - 1} items left`);
  });

  it("without from it is the whole level, as before", async () => {
    const s = (await (await get(sayLevel.id)).json()) as Session;
    expect(s.levelFrom).toBe(0);
    expect(s.greeting).toBe(levelGreeting(sayLevel));
    expect(s.system_prompt).toContain(buildLevelPrompt(sayLevel));
  });

  it("resumes a Catch level on its next claim without saying which kind it is", async () => {
    const items = catchLevel.items as CatchItem[];
    const s = (await (await get(catchLevel.id, 1)).json()) as Session;
    expect(s.greeting).toContain(items[1].claim);
    expect(s.greeting).not.toMatch(/bluff, the page|planted bluff/i);
  });

  it("refuses a resume point outside the level", async () => {
    expect((await get(sayLevel.id, sayLevel.rounds)).status).toBe(400);
    const junk = await sessionRoute.GET(new Request(`http://localhost/api/oral/session?subjectId=${course.id}&levelId=${sayLevel.id}&from=abc`));
    expect(junk.status).toBe(400);
    const noLevel = await sessionRoute.GET(new Request(`http://localhost/api/oral/session?subjectId=${course.id}&from=1`));
    expect(noLevel.status).toBe(400);
  });
});

describe("client side of a reconnect", () => {
  it("asks for the rounds already closed, and only when there are some", () => {
    expect(levelSessionUrl("s 1", "l1", 0)).toBe("/api/oral/session?subjectId=s%201&levelId=l1");
    expect(levelSessionUrl("s 1", "l1", 2)).toBe("/api/oral/session?subjectId=s%201&levelId=l1&from=2");
  });

  it("says the session ended, keeps the score, and offers reconnect or typing", () => {
    const v = sessionEndedView(2, 5);
    expect(v.title).toBe("The voice session ended");
    expect(v.message).toContain("2 finished rounds are kept");
    expect(v.message).toContain("round 3 of 5");
    expect(v.actions).toEqual(["retry", "type"]);
  });
});
