/**
 * Prints the size of the Run that generateRun builds for every shipped subject.
 *
 *   npx tsx scripts/run-shape.mts
 *
 * Columns: subject id, levels, worlds, count per level kind, thin flag.
 * Read only: it builds runs in memory and touches no store.
 */
import { generateRun } from "@/lib/game/run";
import { COURSES } from "@/lib/courses";

for (const course of Object.values(COURSES)) {
  const run = generateRun(course);
  const kinds: Record<string, number> = {};
  for (const level of run.levels) kinds[level.kind] = (kinds[level.kind] ?? 0) + 1;
  console.log(course.id, run.size, run.worlds.length, JSON.stringify(kinds), run.thin ?? false);
}
