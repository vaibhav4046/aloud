import type { Subject } from "@/lib/courses/types";
import { quoteInPassage } from "@/lib/oral/verify-claim";
import { rid, serverLog } from "@/lib/observe";
import type { EventStore } from "@/lib/store/repo";
import { newProgress, rebaseProgress, type Ctx } from "./progress";
import { generateRun, withRecall } from "./run";
import { heartsForLevel, maxXpForLevel } from "./scoring";
import { ProgressSchema } from "./schema";
import { checkResultByReplay } from "./trust";
import type { Level, LevelResult, Progress, ProofCard, Run } from "./types";

/**
 * The storage-facing half of the game engine: load or build a learner's run,
 * read their progress, and check what a client reports against the run.
 * Everything takes the store and the owner explicitly; nothing here resolves
 * identity, so a route cannot forget whose data it is touching.
 */

export const runKey = (subjectId: string): string => `run:${subjectId}`;
export const progressKey = (subjectId: string): string => `progress:${subjectId}`;

/** A run stored before hearts followed the round count: give each level the hearts it would get today. */
function withCurrentHearts(run: Run): Run {
  let changed = false;
  const levels = run.levels.map((l) => {
    const hearts = heartsForLevel(l.kind, l.rounds);
    if (hearts === l.hearts) return l;
    changed = true;
    return { ...l, hearts };
  });
  return changed ? { ...run, levels } : run;
}

function looksLikeRun(doc: unknown, subjectId: string): doc is Run {
  if (!doc || typeof doc !== "object") return false;
  const r = doc as Partial<Run>;
  return r.id === `run_${subjectId}` && r.subjectId === subjectId && Array.isArray(r.levels) && r.levels.length > 0 && Array.isArray(r.worlds);
}

/**
 * The stored progress for a subject, or null when there is none. A stored copy
 * that no longer parses is not thrown away silently: it is kept under
 * `<key>.unreadable` (once) and logged, then the player starts from a fresh copy.
 */
export async function loadProgress(store: EventStore, userId: string, subjectId: string): Promise<Progress | null> {
  const doc = await store.getGameDoc(userId, progressKey(subjectId));
  if (doc === null) return null;
  const parsed = ProgressSchema.safeParse(doc);
  if (parsed.success) return parsed.data as Progress;
  const backupKey = `${progressKey(subjectId)}.unreadable`;
  try {
    if ((await store.getGameDoc(userId, backupKey)) === null) await store.putGameDoc(userId, backupKey, doc);
  } catch (e) {
    serverLog("game_progress.backup_failed", rid(), { err: (e as Error).message?.slice(0, 160) ?? "unknown" });
  }
  serverLog("game_progress.unreadable", rid(), { issue: parsed.error.issues[0]?.path.join(".") ?? "body" });
  return null;
}

export type LoadedRun = { run: Run; created: boolean; progress: Progress | null };

/**
 * The caller's run for a subject. Built and stored on first use; later calls
 * return the stored run with recall levels applied for the stored progress.
 * `regenerate` rebuilds from the current material; level ids are stable, so
 * results the player already earned keep pointing at the same levels.
 */
export async function loadRun(
  store: EventStore,
  userId: string,
  subject: Subject,
  opts: { regenerate?: boolean; now: Date }
): Promise<LoadedRun> {
  const [stored, progress] = await Promise.all([store.getGameDoc(userId, runKey(subject.id)), loadProgress(store, userId, subject.id)]);
  if (opts.regenerate || !looksLikeRun(stored, subject.id)) {
    const run = generateRun(subject, { now: opts.now.toISOString(), progress });
    await store.putGameDoc(userId, runKey(subject.id), run);
    return { run, created: true, progress };
  }
  const current = withCurrentHearts(stored);
  const run = progress ? withRecall(current, subject, progress) : current;
  if (run !== stored) await store.putGameDoc(userId, runKey(subject.id), run);
  return { run, created: false, progress };
}

/** Progress ready to hand to a screen: stored or fresh, with derived fields recomputed against the run. */
export function progressFor(progress: Progress | null, run: Run, ctx: Ctx): { progress: Progress; persisted: boolean } {
  return progress ? { progress: rebaseProgress(progress, run), persisted: true } : { progress: newProgress(run.id, ctx), persisted: false };
}

/** Null when a reported result is possible for the level, otherwise why it is not. */
export function checkResultAgainstLevel(result: LevelResult, level: Level): string | null {
  if (result.xp > maxXpForLevel(level)) return "xp above what the level can pay";
  if (result.rounds.length > level.rounds) return "more rounds than the level has";
  if (result.heartsLeft > level.hearts) return "more hearts than the level starts with";
  if (result.outcome === "won" && result.stars < 1) return "a won level has at least one star";
  if (result.outcome !== "won" && (result.stars > 0 || result.xp > 0)) return "only a won level earns stars or XP";
  return checkResultByReplay(result, level);
}

/** Keep the proof cards whose quote is verbatim in the passage they name, in this subject's own pages. */
export function verifiedProofs(proofs: ProofCard[], subject: Subject, levelId: string): ProofCard[] {
  const passages = new Map(subject.sources.flatMap((s) => s.chunks).map((c) => [c.id, c]));
  return proofs
    .filter((c) => {
      const passage = passages.get(c.passageId);
      return passage !== undefined && quoteInPassage(c.quote, passage.text);
    })
    .map((c) => ({ ...c, levelId }));
}
