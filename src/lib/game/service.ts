import type { Subject } from "@/lib/courses/types";
import { quoteInPassage } from "@/lib/oral/verify-claim";
import type { EventStore } from "@/lib/store/repo";
import { newProgress, rebaseProgress, type Ctx } from "./progress";
import { generateRun, withRecall } from "./run";
import { heartsForLevel, maxXpForLevel } from "./scoring";
import { ProgressSchema } from "./schema";
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

/** The stored progress for a subject, or null when there is none or it no longer parses. */
export async function loadProgress(store: EventStore, userId: string, subjectId: string): Promise<Progress | null> {
  const doc = await store.getGameDoc(userId, progressKey(subjectId));
  if (doc === null) return null;
  const parsed = ProgressSchema.safeParse(doc);
  return parsed.success ? (parsed.data as Progress) : null;
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

/**
 * A client copy of progress reduced to what this run can have produced: results
 * only for levels in the run, XP per level no higher than the level can pay,
 * proofs only for this run's levels.
 */
export function sanitizeForRun(p: Progress, run: Run): Progress {
  const byId = new Map(run.levels.map((l) => [l.id, l]));
  const results: Progress["results"] = {};
  for (const [id, r] of Object.entries(p.results)) {
    const level = byId.get(id);
    if (!level || r.levelId !== id || checkResultAgainstLevel(r, level) !== null) continue;
    results[id] = r;
  }
  return { ...p, runId: run.id, results, proofs: p.proofs.filter((c) => byId.has(c.levelId)) };
}

/** Null when a reported result is possible for the level, otherwise why it is not. */
export function checkResultAgainstLevel(result: LevelResult, level: Level): string | null {
  if (result.xp > maxXpForLevel(level)) return "xp above what the level can pay";
  if (result.rounds.length > level.rounds) return "more rounds than the level has";
  if (result.heartsLeft > level.hearts) return "more hearts than the level starts with";
  if (result.outcome === "won" && result.stars < 1) return "a won level has at least one star";
  if (result.outcome !== "won" && (result.stars > 0 || result.xp > 0)) return "only a won level earns stars or XP";
  return null;
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
