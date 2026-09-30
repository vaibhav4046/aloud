import { describe, expect, it } from "vitest";
import { COURSES } from "@/lib/courses";
import { generateRun } from "@/lib/game/run";
import type { CatchItem, Level, Run } from "@/lib/game/types";
import { notesSubject } from "./game-notes-fixture";

/**
 * A boss draws its claims from the world it closes. Reusing a claim the player
 * already saw revealed in that world's Catch levels turns the boss into a
 * memory test of the answers, not a check on the material.
 */

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

function worldLevels(run: Run, boss: Level): Level[] {
  return run.levels.filter((l) => l.world === boss.world && l.kind === "catch");
}

/** Every sentence the world's Catch levels already showed: the claims as stated and the page lines behind them. */
function seen(levels: Level[]): Set<string> {
  const out = new Set<string>();
  for (const l of levels) for (const i of (l.items ?? []) as CatchItem[]) {
    out.add(norm(i.claim));
    out.add(norm(i.source));
  }
  return out;
}

function reused(run: Run): { boss: string; claim: string }[] {
  const found: { boss: string; claim: string }[] = [];
  for (const boss of run.levels.filter((l) => l.kind === "boss")) {
    const shown = seen(worldLevels(run, boss));
    for (const i of (boss.items ?? []).filter((x): x is CatchItem => x.type === "catch")) {
      if (shown.has(norm(i.claim)) || shown.has(norm(i.source))) found.push({ boss: boss.id, claim: i.claim });
    }
  }
  return found;
}

describe("boss claims are not ones the world already revealed", () => {
  const ids = Object.keys(COURSES);

  it.each(ids)("%s", (id) => {
    const run = generateRun(COURSES[id] as never, { now: "2026-09-30T00:00:00.000Z" });
    expect(reused(run)).toEqual([]);
  });

  it("holds for an uploaded subject", async () => {
    const run = generateRun(await notesSubject("u1"), { now: "2026-09-30T00:00:00.000Z" });
    expect(reused(run)).toEqual([]);
  });

  it("every boss that has claims keeps at least one bluff and one real claim, and stays deterministic", () => {
    for (const id of ids) {
      const run = generateRun(COURSES[id] as never, { now: "2026-09-30T00:00:00.000Z" });
      for (const boss of run.levels.filter((l) => l.kind === "boss")) {
        const claims = (boss.items ?? []).filter((x): x is CatchItem => x.type === "catch");
        if (claims.length >= 2) {
          expect(claims.some((c) => c.isBluff), `${id} ${boss.id} has a bluff`).toBe(true);
          expect(claims.some((c) => !c.isBluff), `${id} ${boss.id} has a real claim`).toBe(true);
        }
      }
      expect(JSON.stringify(generateRun(COURSES[id] as never, { now: "2026-09-30T00:00:00.000Z" }))).toBe(JSON.stringify(run));
    }
  });
});
