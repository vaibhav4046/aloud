/**
 * Results the server will accept for every level before `upto`, scored by the game's own engine
 * (all rounds correct, none page-checked, the lowest XP an honest full clear can carry). The live
 * drive writes them to the browser and to the server so a later level is unlocked on both.
 *
 *   echo '{"run":{...},"upto":5,"skip":["l_x"]}' | tsx scripts/probes/aloud-seed.mts
 */
import { readFileSync } from "node:fs";
import { scoreLevel } from "../../src/lib/game/scoring";
import type { Level, LevelResult, Run } from "../../src/lib/game/types";

const input = JSON.parse(readFileSync(0, "utf8")) as { run: Run; upto: number; skip?: string[] };
const skip = new Set(input.skip ?? []);
const results: LevelResult[] = input.run.levels
  .filter((l: Level) => l.index < input.upto && !skip.has(l.id))
  .map((l: Level) => {
    const rounds = Array.from({ length: l.rounds }, () => ({ conceptId: l.conceptIds?.[0] ?? "c", outcome: "correct" as const, grounded: false, ms: 0 }));
    const { result } = scoreLevel({ id: l.id, kind: l.kind, hearts: l.hearts, rounds: l.rounds }, rounds, { playedAt: new Date().toISOString() });
    return { ...result, ms: 60_000, missedConceptIds: [], clearedConceptIds: [] };
  });
process.stdout.write(JSON.stringify(results));
