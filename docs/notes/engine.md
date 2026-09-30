# Aloud game engine: signatures and data shapes

Worker: G-ENGINE. Branch wt/engine. All modules are pure TypeScript, no React, no browser globals, no clock or randomness of their own (time is passed in). Types live in `src/lib/game/types.ts`. Import with `@/lib/game/...`.

Status of each section is marked. Anything marked PLANNED is written here first so UI workers can code against it; the signature will not change without a note in the final report.

## 1. Types (src/lib/game/types.ts), what was added

Additive only. Nothing existing was renamed or removed.

- `Level.items?: LevelItem[]` (always set by `generateRun`). `LevelItem = SayItem | CatchItem`.
- `SayItem { type: "say"; conceptId; question; hint; focus: "recall" | "why" | "apply" | "exam" }`
- `CatchItem { type: "catch"; conceptId; claim; isBluff; source; passageId; page: number | null; alteration: ClaimAlteration | null; trapId? }`
  - `claim` is the exact sentence the examiner states.
  - `source` is the player's own page sentence the claim was built from (verbatim). Show it on reveal.
  - `alteration` is set on bluffs only: `{ kind: "number" | "antonym" | "negation" | "swap" | "trap"; from; to }`. Highlight `to` in the claim and `from` in the source on reveal.
- `LevelResult.ms?`, `.missedConceptIds?`, `.clearedConceptIds?`
- `Progress.todayDay?: string | null` (the local day `todayMinutes` belongs to)
- `RoundReport.hinted?: boolean`

## 2. Run generation (src/lib/game/run.ts)

```ts
export const MIN_LEVELS = 12, MAX_LEVELS = 30, LEVELS_PER_WORLD = 5
export type RunSource = Pick<Course, "id" | "title" | "concepts" | "sources" | "examQuestions" | "traps" | "explainers">
export function generateRun(subject: RunSource, opts?: { now?: string; progress?: Progress | null }): Run
export function withRecall(run: Run, subject: RunSource, progress: Progress): Run
export function findLevel(run: Run, levelId: string): Level | null
```

- Deterministic: same subject and same `opts` give a byte-identical Run. `now` becomes `createdAt` (default: `"1970-01-01T00:00:00.000Z"`).
- `run.id = "run_" + subject.id`. Level ids are stable strings (`l_say_<concept>_<tier>`, `l_catch_...`, `l_boss_<world>`, `l_recall_<hash>`), so results keyed by level id survive regeneration. `index` is renumbered.
- Size 12..30 from the material: each concept yields say levels (one per distinct exam question, capped by tier) and catch levels (one per 3 usable page claims), plus one boss per world. Never padded: every level carries its own distinct items.
- Worlds hold about 5 levels and end with a boss (`kind: "boss"`, hearts 4). `Run.worlds[i].levelIds` is in play order.
- Difficulty is non-decreasing across the run, starts at 1, ends at 5.
- Recall: `withRecall` inserts `kind: "recall"` levels (say-type items on the concepts in `progress.weakConceptIds`) inside the first unfinished worlds, before the boss. It never touches a level that has a result, keeps total size at or under 30 (at the cap it replaces a later, unplayed, doubly covered level), and is idempotent. `generateRun(subject, { progress })` = base run then `withRecall`.
- Catch item mix: every catch level holds at least one real claim and at least one bluff. Bluffs come from the course Traps and from a deliberately altered page sentence. An altered claim is only kept when the existing verify guard (`src/lib/oral/claim-guard.ts`) would back a contradiction quote for it.

## 3. Scoring (src/lib/game/scoring.ts)

```ts
export const HEARTS_DEFAULT = 3, HEARTS_BOSS = 4, XP_CORRECT = 100, XP_PARTIAL = 50, XP_BLUFF_CAUGHT = 150, XP_GROUNDED_BONUS = 25, BOSS_MULTIPLIER = 1.5, HINT_FACTOR = 0.5, MAX_RANK = 30
heartsFor(kind: LevelKind): number
comboMultiplier(combo: number): 1 | 1.2 | 1.5 | 2
isMiss(o: RoundOutcome): boolean        // incorrect | bluff_missed
isSuccess(o: RoundOutcome): boolean     // correct | bluff_caught

type LevelRun = { levelId; kind; heartsMax; hearts; totalRounds; combo; bestCombo; xp; rounds: RoundOutcome[]; missedConceptIds; clearedConceptIds; proofs; ms; status: "playing" | "won" | "lost" }
type RoundDelta = { outcome; xpGained; multiplier; heartLost; comboAfter }
startLevel(level: Pick<Level, "id" | "kind" | "hearts" | "rounds">): LevelRun
applyRound(run: LevelRun, report: RoundReport): { run: LevelRun; delta: RoundDelta }   // immutable; use for live UI
finishLevel(run: LevelRun, opts: { playedAt: string }): { result: LevelResult; proofs: ProofCard[] }
scoreLevel(level, reports: RoundReport[], opts: { playedAt: string }): { result; proofs; deltas: RoundDelta[] }

starsFor(rounds: RoundOutcome[], status): 0 | 1 | 2 | 3
xpForRank(rank: number): number           // rank 1 = 0, rank 2 = 300, each step 8% more
rankForXp(xp: number): number             // 1..30
rankProgress(xp: number): { rank; xpIntoRank; xpForNext: number | null; fraction: number }
unlockedIndexFor(levels: {id; index}[], results: Record<string, { stars }>): number
isLevelUnlocked(levelIndex: number, unlockedIndex: number): boolean
maxXpForLevel(level: Pick<Level, "kind" | "rounds">): number
```

Rules the code implements (see the header of scoring.ts for the judgement calls): combo counts consecutive successes and the round that reaches 3 pays x1.2; a partial keeps the combo; a miss resets it and costs one heart; zero hearts ends the level as `lost` at once; a lost or quit level pays 0 XP and keeps its proof cards; 3 stars = no miss, no skip, at most one partial; 2 = at most one heart lost; 1 = won.

## 4. Progress (src/lib/game/progress.ts)

```ts
export const ENDOWED_XP = 60, DAILY_GOAL_DEFAULT = 10, FREEZE_EVERY = 7, MAX_FREEZES = 2, MAX_PROOFS = 300, MAX_WEAK = 12
export type Ctx = { now: Date; tz?: string }        // tz is an IANA name, default "UTC". UI: Intl.DateTimeFormat().resolvedOptions().timeZone
localDay(now: Date, tz?: string): string             // "YYYY-MM-DD" in that zone
newProgress(runId: string, ctx: Ctx): Progress       // xp starts at ENDOWED_XP (the "head start"), level 1 unlocked
applyLevelResult(p: Progress, run: Run, result: LevelResult, proofs: ProofCard[], ctx: Ctx): Progress
  // idempotent on (levelId, playedAt). Keeps the better result per level (stars, then xp).
  // XP paid on a replay is only the improvement over the old best. Updates rank, unlock, weak concepts,
  // proofs (deduped by id), streak, freeze earning, daily minutes.
streakStatus(p: Progress, ctx: Ctx): { days: number; state: "none" | "safe" | "at_risk" | "broken"; missedDays: number; freezesNeeded: number; freezes: number; playedToday: boolean }
  // "at_risk" = last played yesterday. "broken" = the gap is longer than the freezes can cover.
  // Show `days` as 0 when state is "broken".
dailyGoalFraction(p: Progress, ctx: Ctx): number     // 0..1, 0 when todayDay is not today
addMinutes(p: Progress, minutes: number, ctx: Ctx): Progress
setDailyGoal(p: Progress, minutes: number, ctx: Ctx): Progress   // clamps 1..120
mergeProgress(a: Progress, b: Progress, run?: Run): Progress     // local + server. xp never decreases.
rebaseProgress(p: Progress, run: Run): Progress      // recompute unlockedIndex and rank against the current run
```

Streak rules: first finished level starts the streak at 1. Same local day changes nothing. Next day adds 1. A gap of N missed days spends N freezes if the player holds that many (streak continues), otherwise it resets to 1 and no freeze is spent. A freeze is earned each time the streak reaches a multiple of 7, capped at 2. A clock that goes backwards changes nothing.

Persistence: the client keeps `Progress` in localStorage (key is the UI worker's choice; suggested `aloud.progress.<subjectId>`) and posts it to `/api/game/progress`, which merges and returns the merged copy.

## 5. Session adapter (src/lib/game/session.ts) and the level prompt (src/lib/oral/prompt.ts)

```ts
// prompt.ts
export const LEVEL_PROMPT_VERSION: string
export function buildLevelPrompt(level: Level): string              // appended to the examiner system prompt
export function levelGreeting(level: Level): string                 // spoken first line, code-written, never hints at a bluff

// session.ts
export type Stance = "real" | "bluff"
export function stanceOf(transcript: string): Stance | null         // null = could not tell; ask the player to tap Real or Bluff
export type ToolEvent = { name: string; args?: Record<string, unknown>; result: Record<string, unknown>; isError?: boolean }
export type RoundDraft = { itemIndex: number; startedAtMs: number; stance: Stance | null; hinted: boolean; verify: VerifySnapshot | null; grade: GradeSnapshot | null }
beginRound(level: Level, itemIndex: number, nowMs: number): RoundDraft
noteUserSpeech(draft: RoundDraft, level: Level, transcript: string): RoundDraft   // catch rounds: sets stance from words
setStance(draft: RoundDraft, stance: Stance): RoundDraft                            // typed fallback buttons
noteHint(draft: RoundDraft): RoundDraft
noteToolEvent(draft: RoundDraft, level: Level, ev: ToolEvent, chunks: SourceChunk[]): RoundDraft   // verify_claim / grade_my_answer results
isRoundReady(draft: RoundDraft, level: Level): boolean
closeRound(draft: RoundDraft, level: Level, nowMs: number): RoundReport            // outcome decided here, from code only
```

Where outcomes come from:
- Say, boss say-items, recall: the `grade_my_answer` tool result (`correct | partial | incorrect`). A `verify_claim` result of `contradicted` on the player's own words caps the round at `partial`. `grounded` is true only when a `verify_claim` result carried a code-checked quote for this round.
- Catch: truth is the item's `isBluff` flag. The player's stance comes from `stanceOf` on their words, or the Real/Bluff buttons. Bluff and called bluff = `bluff_caught`; bluff and called real = `bluff_missed`; real and called real = `correct`; real and called bluff = `incorrect`; no stance = `skipped`. `verify_claim` on the stated claim only supplies the proof: it counts when it agrees with the flag (bluff with `contradicted`, real with `supported`) and the quote is a verbatim substring of a passage in `chunks`. It never changes the outcome.
- Model prose is never read.

Server side: `GET /api/oral/session?subjectId=&levelId=` returns the usual oral session config with the level block appended to `system_prompt` and `greeting` replaced by `levelGreeting`. `POST /api/oral/tool` accepts an extra optional `levelId`. With it, a `verify_claim` on one of the level's own catch claims does not write to the learner's mastery (the examiner said it, not the player).

## 6. API (src/app/api/game/*)

All routes resolve the caller from the identity cookie (`viva_did`), scope every read and write to that user, send `Cache-Control: no-store`, rate limit per IP and per identity, and cap the body at 64 KB. Errors use the existing `{ error: { code, message, retryable } }` envelope.

`GET /api/game/run?subjectId=<id>`  (subjectId optional, default sample course)
  -> 200 `{ run: Run, created: boolean }`. Generates and persists on first call; later calls return the stored run with recall levels applied for the stored progress.
  -> 404 `SUBJECT_NOT_FOUND` for a subject that is not the caller's and not a starter.

`POST /api/game/run`  body `{ subjectId?: string; regenerate?: boolean }`
  -> 200 `{ run, created }`. `regenerate: true` rebuilds from the current material and keeps progress (results are keyed by stable level ids).

`GET /api/game/progress?subjectId=<id>`
  -> 200 `{ progress: Progress, persisted: boolean }` (a fresh endowed Progress with `persisted: false` when none is stored).

`POST /api/game/progress`  body one of
  - `{ subjectId: string, progress: Progress }`: merge the client copy into the stored one.
  - `{ subjectId: string, result: LevelResult, proofs?: ProofCard[], tz?: string }`: apply one finished level (bounded: `xp <= maxXpForLevel`, `rounds.length <= level.rounds`, level id must be in the run).
  -> 200 `{ progress: Progress }` (merged). Posting the same body twice returns the same progress.
  -> 400 `BAD_REQUEST` (malformed or out of bounds), 413 `PAYLOAD_TOO_LARGE`, 429 `RATE_LIMITED`, 404 `SUBJECT_NOT_FOUND`.

Storage: two new `EventStore` methods, `getGameDoc(userId, key)` and `putGameDoc(userId, key, doc)`, implemented for the file store and Postgres (table `game_docs`, created lazily and in `migrations/006_game_docs.sql`). Keys: `run:<subjectId>` and `progress:<subjectId>`.
