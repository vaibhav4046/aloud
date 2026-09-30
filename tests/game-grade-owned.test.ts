import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetLimits } from "@/lib/limits";
import { FileEventStore } from "@/lib/store/file";
import type { Subject } from "@/lib/courses/types";
import type { Level, Run, SayItem } from "@/lib/game/types";
import { notesSubject } from "./game-notes-fixture";

/**
 * grade_my_answer for a subject the learner built from their own notes.
 *
 * The route used to hand the grader a course only for the starter subjects, so
 * every typed answer on an uploaded subject came back "I cannot grade that
 * without the subject's map" with isError false, and the level sat on
 * "Checking your page" for good. These tests run the real route over a real
 * paste-origin subject and a run generated from it.
 */

const jar = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "viva_did" && jar.value !== undefined ? { name, value: jar.value } : undefined) }),
}));
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: (fn: () => unknown) => { void fn(); } };
});

const gameRun = await import("@/app/api/game/run/route");
const tool = await import("@/app/api/oral/tool/route");

const DID = "0000000000000000000000000000c0de";
const USER = `demo_${DID}`;

let tmp: string;
let subject: Subject;
let run: Run;

beforeAll(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "aloud-grade-owned-"));
  process.env.DATA_DIR = tmp;
});
afterAll(async () => {
  delete process.env.DATA_DIR;
  await fs.rm(tmp, { recursive: true, force: true });
});
beforeEach(async () => {
  jar.value = DID;
  __resetLimits();
  subject = await notesSubject(USER);
  await new FileEventStore().saveSubject(USER, subject);
  const res = await gameRun.GET(new Request(`http://localhost/api/game/run?subjectId=${subject.id}`));
  run = ((await res.json()) as { run: Run }).run;
});

type ToolBody = { callId: string; result: Record<string, unknown>; isError: boolean };

async function callTool(name: string, args: Record<string, unknown>, levelId?: string): Promise<ToolBody> {
  const res = await tool.POST(
    new Request("http://localhost/api/oral/tool", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "10.1.1.1" },
      body: JSON.stringify({ callId: `c_${Math.random().toString(36).slice(2, 8)}`, name, arguments: args, subjectId: subject.id, levelId }),
    })
  );
  return (await res.json()) as ToolBody;
}

const sayLevel = (): Level => run.levels.find((l) => l.kind === "say")!;
const descriptionOf = (conceptId: string): string => subject.concepts.find((c) => c.id === conceptId)!.description;

describe("grade_my_answer on an uploaded subject", () => {
  it("is an uploaded subject, not a starter", () => {
    expect(subject.origin).toBe("paste");
    expect(subject.demo).toBe(false);
  });

  it("grades a typed answer to the first Say question instead of refusing for want of a map", async () => {
    const level = sayLevel();
    const item = level.items![0] as SayItem;
    const out = await callTool("grade_my_answer", { question: item.question, answer: descriptionOf(item.conceptId) }, level.id);
    expect(out.result.error).toBeUndefined();
    expect(out.isError).toBe(false);
    expect(["correct", "partial", "incorrect"]).toContain(out.result.verdict);
  });

  it("grades every Say item of the run, whatever its focus", async () => {
    const say = run.levels.filter((l) => l.kind === "say");
    expect(say.length).toBeGreaterThan(3);
    for (const level of say) {
      for (const item of level.items as SayItem[]) {
        const out = await callTool("grade_my_answer", { question: item.question, answer: descriptionOf(item.conceptId) }, level.id);
        expect(out.result.error, `${level.id}: ${item.question}`).toBeUndefined();
        expect(out.result.verdict, `${level.id}: ${item.question}`).toBeDefined();
      }
    }
  });

  it("marks an answer from a different topic as not correct", async () => {
    const level = sayLevel();
    const item = level.items![0] as SayItem;
    const out = await callTool("grade_my_answer", { question: item.question, answer: "The capital of France is Paris and it sits on the Seine." }, level.id);
    expect(out.result.verdict).not.toBe("correct");
  });
});
