import { quoteInPassage } from "@/lib/oral/verify-claim";
import type { SourceChunk } from "@/lib/types";
import type { CatchItem, Level, LevelItem, RoundOutcome, RoundReport } from "./types";

/**
 * Turns what happened in an oral session into RoundReports.
 *
 * The rule this file exists to keep: an outcome comes from a tool result or
 * from code acting on the level's own data, never from the words the model
 * spoke. Nothing here takes the examiner's prose as input.
 *
 *  - Say, Recall and the question rounds of a Boss are graded by the
 *    `grade_my_answer` result. A `verify_claim` result of `contradicted` on the
 *    player's own words caps that round at `partial`.
 *  - Catch rounds are decided by the item's `isBluff` flag (set in code when
 *    the run was generated) against the stance the player took (from their
 *    words through `stanceOf`, or the Real and Bluff buttons). `verify_claim`
 *    on the stated claim only supplies the page proof and never changes the
 *    outcome.
 *  - A proof card is issued only when the tool's quote is a verbatim
 *    substring of the named passage in `chunks`. That check runs here, again,
 *    in code, whatever the tool said.
 */

export type Stance = "real" | "bluff";

const RANK_PHRASE = /\b(?:real or (?:a )?bluff|bluff or (?:a )?real|true or false|false or true|real or fake|fake or real)\b/g;
/** Negated phrases read as the opposite stance. */
const NOT_BLUFF = /\b(?:not (?:a )?bluff|no bluff|isn'?t (?:a )?bluff|is not (?:a )?bluff|not (?:a )?fake|not false|isn'?t false|is not false)\b/g;
const NOT_REAL = /\b(?:not (?:a )?real|not true|not right|not correct|isn'?t (?:real|true|right|correct)|is not (?:real|true|right|correct)|not accurate|not legit)\b/g;
const BLUFF_WORD = /\b(?:bluff|bluffing|false|fake|lie|lying|wrong|incorrect|untrue|made up|planted|altered|changed|tampered)\b/g;
/** "right" alone is an interjection ("oh right"); it is a verdict only after a copula ("that's right"). */
const REAL_WORD = /\b(?:real|true|correct|legit|genuine|accurate|agree)\b|(?<=\b(?:that'?s|that is|it'?s|it is|this is|is|looks|seems|sounds)\s(?:(?:totally|absolutely|definitely|pretty|quite|all|exactly|completely)\s)?)right\b/g;
/** The correction after a verdict ("the correct version says ...") names the truth; it is not a second verdict. */
const CORRECTION = /\b(?:(?:the|a|an|its|their)\s+)?(?:correct|real|right|true|actual|proper|original)\s+(?:version|value|answer|figure|number|fact|statement|wording|reading|quote|line|result|definition|name|word|term)\b/g;
/** "no, actually", "wait", "I mean": the words before a verdict that takes back the one before. */
const RETRACT = /\b(?:no|nope|wait|actually|sorry|scratch that|i mean|on second thought|hold on|correction|make that)\b/;
/** A sentence that asks something, with or without its question mark. */
const QUESTION_START = /^\s*(?:(?:um+|uh+|hmm+|so|well|wait|ok|okay|and|but)[,\s]+)*(?:is|are|was|were|does|do|did|can|could|would|should|will|what|why|how|which|who|when|where|really|isn'?t|aren'?t|doesn'?t|wasn'?t)\b/;
/** A reaction to the reveal, not an answer to anything. */
const ASIDE = /\bi (?:thought|figured|knew|guessed|suspected) so\b|\bknew it\b|\bmakes sense\b|\bgot it\b|\bi see\b|\bfair enough\b|\bgood (?:one|catch)\b|\bnice one\b|\bthank(?:s| you)\b|\binteresting\b|\bas expected\b|\bnoted\b/;

type Cue = { stance: Stance; retracts: boolean };

/** The verdict cues of one clause, in the order spoken. */
function cuesIn(clause: string): Cue[] {
  let text = clause.replace(CORRECTION, (m) => " ".repeat(m.length));
  const found: { at: number; stance: Stance }[] = [];
  const take = (re: RegExp, stance: Stance) => {
    text = text.replace(re, (m, offset: number) => {
      found.push({ at: offset, stance });
      return " ".repeat(m.length);
    });
  };
  take(NOT_BLUFF, "real");
  take(NOT_REAL, "bluff");
  take(BLUFF_WORD, "bluff");
  take(REAL_WORD, "real");
  return found
    .sort((a, b) => a.at - b.at)
    .map((f) => ({ stance: f.stance, retracts: RETRACT.test(clause.slice(0, f.at)) }));
}

/**
 * The stance in a player's words, or null when it cannot be told.
 *
 * The verdict is what they say first. What follows it ("The correct version
 * says ...") is a correction and is not read as a second verdict. Questions
 * ("is that true?") and reactions ("oh right, I thought so") are not answers.
 * A later verdict of the other kind counts only when a retraction sits before
 * it ("real... no, actually a bluff"); words that carry both kinds with no
 * retraction return null so the Real and Bluff buttons decide, not a guess.
 * The examiner's own question phrasing ("real or bluff") is ignored.
 */
export function stanceOf(transcript: string): Stance | null {
  const text = transcript.toLowerCase().replace(/[’]/g, "'").replace(RANK_PHRASE, " ");
  let stance: Stance | null = null;
  for (const [, body = "", end = ""] of text.matchAll(/([^.!?;\n]+)([.!?;\n]*)/g)) {
    if (end.includes("?") || QUESTION_START.test(body) || ASIDE.test(body)) continue;
    for (const cue of cuesIn(body)) {
      if (stance === null) stance = cue.stance;
      else if (cue.stance !== stance) {
        if (!cue.retracts) return null;
        stance = cue.stance;
      }
    }
  }
  return stance;
}

export type ToolEvent = {
  name: string;
  args?: Record<string, unknown>;
  result: Record<string, unknown>;
  isError?: boolean;
};

export type VerifySnapshot = {
  claim: string;
  verdict: "supported" | "contradicted" | "not_in_material";
  quote: string | null;
  page: number | null;
  passageId: string | null;
};

export type GradeSnapshot = { grade: "correct" | "partial" | "incorrect" };

export type RoundDraft = {
  itemIndex: number;
  startedAtMs: number;
  stance: Stance | null;
  hinted: boolean;
  /** verify_claim on the examiner's stated claim (catch rounds). */
  claimCheck: VerifySnapshot | null;
  /** verify_claim on the player's own words (question rounds). */
  playerCheck: VerifySnapshot | null;
  grade: GradeSnapshot | null;
};

export function beginRound(level: Level, itemIndex: number, nowMs: number): RoundDraft {
  if (!level.items || itemIndex < 0 || itemIndex >= level.items.length) throw new RangeError(`level ${level.id} has no item ${itemIndex}`);
  return { itemIndex, startedAtMs: nowMs, stance: null, hinted: false, claimCheck: null, playerCheck: null, grade: null };
}

const itemOf = (draft: RoundDraft, level: Level): LevelItem => level.items![draft.itemIndex];
const norm = (s: string): string => s.replace(/\s+/g, " ").trim().toLowerCase();

export function setStance(draft: RoundDraft, stance: Stance): RoundDraft {
  return { ...draft, stance };
}

/** The player spoke. On a claim round this sets their stance when their words show one. */
export function noteUserSpeech(draft: RoundDraft, level: Level, transcript: string): RoundDraft {
  if (itemOf(draft, level).type !== "catch") return draft;
  const stance = stanceOf(transcript);
  return stance ? { ...draft, stance } : draft;
}

export function noteHint(draft: RoundDraft): RoundDraft {
  return { ...draft, hinted: true };
}

function snapshotOf(ev: ToolEvent): VerifySnapshot | null {
  const verdict = ev.result.verdict;
  if (verdict !== "supported" && verdict !== "contradicted" && verdict !== "not_in_material") return null;
  const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);
  return {
    claim: typeof ev.args?.claim === "string" ? ev.args.claim : "",
    verdict,
    quote: str(ev.result.quote),
    page: typeof ev.result.page === "number" ? ev.result.page : null,
    passageId: str(ev.result.passage_id),
  };
}

/** Fold a tool result the client saw into the round. Errors and unknown tools change nothing. */
export function noteToolEvent(draft: RoundDraft, level: Level, ev: ToolEvent): RoundDraft {
  if (ev.isError || ev.result.error !== undefined) return draft;
  const item = itemOf(draft, level);
  if (ev.name === "grade_my_answer") {
    const g = ev.result.verdict;
    if (item.type !== "say") return draft;
    return g === "correct" || g === "partial" || g === "incorrect" ? { ...draft, grade: { grade: g } } : draft;
  }
  if (ev.name === "verify_claim") {
    const snap = snapshotOf(ev);
    if (!snap) return draft;
    if (item.type === "catch" && norm(snap.claim) === norm(item.claim)) return { ...draft, claimCheck: snap };
    if (item.type === "say") return { ...draft, playerCheck: snap };
  }
  return draft;
}

/** True when the round has what it needs to be closed: a grade for a question, a stance and a check for a claim. */
export function isRoundReady(draft: RoundDraft, level: Level): boolean {
  return itemOf(draft, level).type === "catch" ? draft.stance !== null && draft.claimCheck !== null : draft.grade !== null;
}

type Proof = NonNullable<RoundReport["proof"]>;

/** A proof from a tool's quote, only when the quote is verbatim in the passage it names in the player's own pages. */
function proofFrom(snap: VerifySnapshot | null, conceptId: string, chunks: readonly SourceChunk[]): Proof | null {
  if (!snap || snap.verdict === "not_in_material" || !snap.quote || !snap.passageId) return null;
  const passage = chunks.find((c) => c.id === snap.passageId);
  if (!passage || !quoteInPassage(snap.quote, passage.text)) return null;
  return { conceptId, quote: snap.quote, page: snap.page ?? passage.locator.page ?? null, passageId: passage.id };
}

function catchOutcome(item: CatchItem, stance: Stance | null): RoundOutcome {
  if (stance === null) return "skipped";
  if (item.isBluff) return stance === "bluff" ? "bluff_caught" : "bluff_missed";
  return stance === "real" ? "correct" : "incorrect";
}

function catchReport(draft: RoundDraft, item: CatchItem, chunks: readonly SourceChunk[], ms: number): RoundReport {
  const outcome = catchOutcome(item, draft.stance);
  // The proof counts only when the check agrees with the code's own flag.
  const agrees = draft.claimCheck && draft.claimCheck.verdict === (item.isBluff ? "contradicted" : "supported");
  const proof = agrees ? proofFrom(draft.claimCheck, item.conceptId, chunks) : null;
  return { conceptId: item.conceptId, outcome, grounded: proof !== null && outcome !== "skipped", ...(proof ? { proof } : {}), ms, hinted: draft.hinted };
}

function sayReport(draft: RoundDraft, conceptId: string, chunks: readonly SourceChunk[], ms: number): RoundReport {
  if (!draft.grade) return { conceptId, outcome: "skipped", grounded: false, ms, hinted: draft.hinted };
  let outcome: RoundOutcome = draft.grade.grade;
  if (outcome === "correct" && draft.playerCheck?.verdict === "contradicted") outcome = "partial";
  const proof = draft.playerCheck?.verdict === "supported" ? proofFrom(draft.playerCheck, conceptId, chunks) : null;
  return { conceptId, outcome, grounded: proof !== null, ...(proof ? { proof } : {}), ms, hinted: draft.hinted };
}

/**
 * Close a round into its report. The outcome is decided here, from tool results
 * and the item's own flag. A question with no grade and a claim with no stance
 * both close as `skipped`.
 */
export function closeRound(draft: RoundDraft, level: Level, chunks: readonly SourceChunk[], nowMs: number): RoundReport {
  const item = itemOf(draft, level);
  const ms = Math.max(0, nowMs - draft.startedAtMs);
  return item.type === "catch" ? catchReport(draft, item, chunks, ms) : sayReport(draft, item.conceptId, chunks, ms);
}
