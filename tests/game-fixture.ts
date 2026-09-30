import type { Level, LevelKind, Progress, Run, World } from "../src/lib/game/types";

/** A 12 level run in three worlds of four, boss last in each, for the screen model tests. */
export function fixtureRun(): Run {
  const kinds: LevelKind[] = ["say", "catch", "say", "boss", "say", "catch", "recall", "boss", "catch", "say", "say", "boss"];
  const levels: Level[] = kinds.map((kind, i) => ({
    id: `lv_${i + 1}`,
    index: i + 1,
    world: Math.floor(i / 4) + 1,
    kind,
    title: `Level ${i + 1} title`,
    blurb: `Blurb ${i + 1}`,
    conceptIds: [`c${(i % 5) + 1}`],
    difficulty: (Math.min(5, Math.floor(i / 3) + 1)) as Level["difficulty"],
    hearts: kind === "boss" ? 4 : 3,
    rounds: kind === "boss" ? 5 : 4,
  }));
  const worlds: World[] = [1, 2, 3].map((w) => ({
    index: w,
    name: `World ${w}`,
    levelIds: levels.filter((l) => l.world === w).map((l) => l.id),
  }));
  return { id: "run_fx", subjectId: "sub_fx", subjectTitle: "Fixture subject", levels, worlds, createdAt: "2026-09-30T00:00:00.000Z", size: 12 };
}

export function fixtureProgress(over: Partial<Progress> = {}): Progress {
  return {
    runId: "run_fx",
    xp: 0,
    rank: 1,
    unlockedIndex: 1,
    streakDays: 0,
    lastPlayedDay: null,
    freezes: 0,
    results: {},
    proofs: [],
    weakConceptIds: [],
    dailyGoalMinutes: 10,
    todayMinutes: 0,
    updatedAt: "2026-09-30T00:00:00.000Z",
    ...over,
  };
}

export function won(levelId: string, stars: 1 | 2 | 3) {
  return {
    levelId,
    stars,
    xp: 200,
    heartsLeft: 3,
    bestCombo: 2,
    rounds: [],
    proofIds: [],
    outcome: "won" as const,
    playedAt: "2026-09-30T00:00:00.000Z",
  };
}
