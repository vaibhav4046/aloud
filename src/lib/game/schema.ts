import { z } from "zod";
import { MAX_FREEZES, MAX_PROOFS, MAX_WEAK } from "./progress";

/**
 * The wire and storage shape of the game's documents, with a bound on every
 * string, number and list. A body that does not fit is refused, never trimmed
 * into something the sender did not send.
 */

const isoTime = z.string().min(10).max(40);
const localDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const id = (max = 120) => z.string().min(1).max(max);

export const RoundOutcomeSchema = z.enum(["correct", "partial", "incorrect", "bluff_caught", "bluff_missed", "skipped"]);

export const LevelResultSchema = z.object({
  levelId: id(),
  stars: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  xp: z.number().int().min(0).max(5000),
  heartsLeft: z.number().int().min(0).max(4),
  bestCombo: z.number().int().min(0).max(50),
  rounds: z.array(RoundOutcomeSchema).max(12),
  proofIds: z.array(id(60)).max(20),
  outcome: z.enum(["won", "lost", "quit"]),
  playedAt: isoTime,
  ms: z.number().min(0).max(3_600_000).optional(),
  missedConceptIds: z.array(id(80)).max(MAX_WEAK).optional(),
  clearedConceptIds: z.array(id(80)).max(MAX_WEAK).optional(),
});

export const ProofCardSchema = z.object({
  id: id(60),
  conceptId: id(80),
  quote: z.string().min(12).max(1200),
  page: z.number().int().min(0).max(100_000).nullable(),
  passageId: id(),
  levelId: id(),
  earnedAt: isoTime,
});

export const ProgressSchema = z.object({
  runId: id(140),
  xp: z.number().int().min(0).max(1_000_000),
  rank: z.number().int().min(1).max(30),
  unlockedIndex: z.number().int().min(1).max(40),
  streakDays: z.number().int().min(0).max(20_000),
  lastPlayedDay: localDay.nullable(),
  freezes: z.number().int().min(0).max(MAX_FREEZES),
  results: z.record(id(), LevelResultSchema).refine((r) => Object.keys(r).length <= 60, "too many results"),
  proofs: z.array(ProofCardSchema).max(MAX_PROOFS),
  weakConceptIds: z.array(id(80)).max(MAX_WEAK),
  dailyGoalMinutes: z.number().int().min(1).max(120),
  todayMinutes: z.number().min(0).max(1440),
  todayDay: localDay.nullable().optional(),
  updatedAt: isoTime,
});

const subjectId = z.string().max(80).optional();
/** An IANA zone name is short and made of letters, digits, underscores, slashes, plus and minus. */
const zoneName = z.string().max(64).regex(/^[A-Za-z0-9_+\-/]+$/).optional();

export const RunPostBody = z.object({ subjectId, regenerate: z.boolean().optional() });

export const ProgressPostBody = z.union([
  z.object({ subjectId, progress: ProgressSchema, tz: zoneName }),
  z.object({ subjectId, result: LevelResultSchema, proofs: z.array(ProofCardSchema).max(20).optional(), tz: zoneName }),
]);
