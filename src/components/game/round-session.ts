import type { CatchItem, Level, LevelItem, RoundReport, SayItem } from "@/lib/game/types";
import type { SourceChunk } from "@/lib/types";

/**
 * Turns what happens in a round (words, taps, tool results) into one
 * RoundReport. The outcome comes from code only: the grader's verdict for say
 * rounds, the claim's `isBluff` flag plus the player's stance for catch rounds.
 * A quote counts as proof only when it is a verbatim substring of a passage the
 * player owns. Model prose is never read.
 *
 * Function names and shapes follow docs/notes/engine.md section 5 (session.ts),
 * so this file can be replaced by the engine module without touching callers.
 */

export type Stance = "real" | "bluff";

export type ToolEvent = { name: string; args?: Record<string, unknown>; result: Record<string, unknown>; isError?: boolean };

type Verify = { verdict: "supported" | "contradicted" | "not_in_material"; quoteOk: boolean; quote: string | null; page: number | null; passageId: string | null };
type Grade = { verdict: "correct" | "partial" | "incorrect" };

export type RoundDraft = {
  itemIndex: number;
  startedAtMs: number;
  stance: Stance | null;
  hinted: boolean;
  verify: Verify | null;
  grade: Grade | null;
};

export function beginRound(_level: Level, itemIndex: number, nowMs: number): RoundDraft {
  return { itemIndex, startedAtMs: nowMs, stance: null, hinted: false, verify: null, grade: null };
}

const BLUFF = /\b(bluff|false|wrong|not true|isn'?t true|untrue|incorrect|not right|isn'?t right|made up|fake|catch)\b/i;
const REAL = /\b(true|real|correct|right|accurate|yes|yeah|legit|genuine)\b/i;

/** "not true" is a bluff call, so bluff wins when both match. Null when the words say neither. */
export function stanceOf(transcript: string): Stance | null {
  if (BLUFF.test(transcript)) return "bluff";
  if (REAL.test(transcript)) return "real";
  return null;
}

const itemAt = (level: Level, i: number): LevelItem | null => level.items?.[i] ?? null;

export function noteUserSpeech(d: RoundDraft, level: Level, transcript: string): RoundDraft {
  if (itemAt(level, d.itemIndex)?.type !== "catch") return d;
  return { ...d, stance: stanceOf(transcript) ?? d.stance };
}

export function setStance(d: RoundDraft, stance: Stance): RoundDraft {
  return { ...d, stance };
}

export function noteHint(d: RoundDraft): RoundDraft {
  return { ...d, hinted: true };
}

const norm = (t: string): string => t.toLowerCase().replace(/\s+/g, " ").trim();

function tokens(t: string): Set<string> {
  return new Set(norm(t).replace(/[^\p{L}\p{N} ]/gu, "").split(" ").filter(Boolean));
}

/** Share of the smaller token set found in the other. Used to tell "the claim on screen" from anything else. */
export function overlap(a: string, b: string): number {
  const x = tokens(a);
  const y = tokens(b);
  const small = x.size <= y.size ? x : y;
  const big = small === x ? y : x;
  if (!small.size) return 0;
  let hit = 0;
  small.forEach((w) => big.has(w) && hit++);
  return hit / small.size;
}

function readVerify(result: Record<string, unknown>, chunks: SourceChunk[]): Verify | null {
  const v = result.verdict;
  if (v !== "supported" && v !== "contradicted" && v !== "not_in_material") return null;
  const quote = typeof result.quote === "string" && result.quote ? result.quote : null;
  const passageId = typeof result.passage_id === "string" ? result.passage_id : null;
  const page = typeof result.page === "number" && Number.isInteger(result.page) && result.page >= 0 ? result.page : null;
  const quoteOk = !!quote && v !== "not_in_material" && chunks.some((c) => norm(c.text).includes(norm(quote)));
  return { verdict: v, quoteOk, quote, page, passageId };
}

export function noteToolEvent(d: RoundDraft, level: Level, ev: ToolEvent, chunks: SourceChunk[]): RoundDraft {
  if (ev.isError) return d;
  const item = itemAt(level, d.itemIndex);
  if (!item) return d;
  if (ev.name === "verify_claim") {
    const claim = typeof ev.args?.claim === "string" ? ev.args.claim : "";
    // In a catch round only the check of the claim on screen counts; anything else is about another round.
    if (item.type === "catch" && overlap(claim, item.claim) < 0.8) return d;
    const verify = readVerify(ev.result, chunks);
    return verify ? { ...d, verify } : d;
  }
  if (ev.name === "grade_my_answer" && item.type === "say") {
    const g = ev.result.verdict;
    return g === "correct" || g === "partial" || g === "incorrect" ? { ...d, grade: { verdict: g } } : d;
  }
  return d;
}

export function isRoundReady(d: RoundDraft, level: Level): boolean {
  const item = itemAt(level, d.itemIndex);
  if (!item) return false;
  return item.type === "catch" ? d.stance !== null : d.grade !== null;
}

function closeCatch(d: RoundDraft, item: CatchItem, ms: number): RoundReport {
  const outcome: RoundReport["outcome"] =
    d.stance === null ? "skipped" : item.isBluff ? (d.stance === "bluff" ? "bluff_caught" : "bluff_missed") : d.stance === "real" ? "correct" : "incorrect";
  // The check agrees with the flag when a bluff is contradicted or a real claim is supported.
  const agrees = !!d.verify && d.verify.quoteOk && d.verify.verdict === (item.isBluff ? "contradicted" : "supported");
  const v = d.verify;
  return {
    conceptId: item.conceptId,
    outcome,
    grounded: agrees,
    hinted: d.hinted,
    ms,
    ...(agrees && v && v.quote && v.passageId ? { proof: { conceptId: item.conceptId, quote: v.quote, page: v.page, passageId: v.passageId } } : {}),
  };
}

function closeSay(d: RoundDraft, item: SayItem, ms: number): RoundReport {
  const v = d.verify;
  let outcome: RoundReport["outcome"] = d.grade?.verdict ?? "skipped";
  // A quote-checked contradiction of the player's own words caps the round at partial.
  if (outcome === "correct" && v?.verdict === "contradicted" && v.quoteOk) outcome = "partial";
  const grounded = !!v && v.quoteOk && v.verdict !== "not_in_material";
  const proof = v && v.quoteOk && v.verdict === "supported" && v.quote && v.passageId && outcome !== "incorrect";
  return {
    conceptId: item.conceptId,
    outcome,
    grounded,
    hinted: d.hinted,
    ms,
    ...(proof && v && v.quote && v.passageId ? { proof: { conceptId: item.conceptId, quote: v.quote, page: v.page, passageId: v.passageId } } : {}),
  };
}

export function closeRound(d: RoundDraft, level: Level, nowMs: number): RoundReport {
  const item = itemAt(level, d.itemIndex);
  const ms = Math.max(0, Math.round(nowMs - d.startedAtMs));
  if (!item) return { conceptId: level.conceptIds[0] ?? "", outcome: "skipped", grounded: false, ms };
  return item.type === "catch" ? closeCatch(d, item, ms) : closeSay(d, item, ms);
}
