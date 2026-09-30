import type { ConceptDef, Trap } from "@/lib/courses/types";
import { overlapsClaim, polarityOf } from "@/lib/oral/claim-guard";
import { tokens } from "@/lib/retrieval";
import type { SourceChunk } from "@/lib/types";
import { pick, shuffled } from "./hash";
import type { CatchItem, ClaimAlteration } from "./types";

/**
 * Claims for Catch levels, built in code from the player's own pages.
 *
 * A real claim is a sentence copied word for word from a passage. A bluff is
 * either a course Trap or a real sentence with one fact changed. A changed
 * sentence is kept only when the same guard verify_claim uses
 * (src/lib/oral/claim-guard.ts) would accept the original sentence as a
 * quote that contradicts it. That is what lets the reveal carry a page proof
 * for every bluff: no proof, no bluff.
 */

const MIN_LEN = 30;
const MAX_LEN = 240;
const MIN_WORDS = 6;

/** A sentence that leans on the sentence before it cannot stand alone as a claim. */
const DEPENDENT_START = /^(?:it|its|this|that|these|those|they|their|them|he|she|such|however|therefore|thus|hence|also|but|and|so|then|instead|otherwise|again|here|there|both|either|neither|each of|the latter|the former)\b/i;
/** Sentences about the exam or the notes themselves are not claims about the subject. */
const META = /\b(?:exam questions?|quiz|in this section|in this chapter|the following|see figure|as shown)\b|\b(?:figures?|tables?|chapter) \d/i;

/** Sentences of a passage that can be stated aloud as a standalone claim. */
export function sentencesOf(text: string): string[] {
  const flat = text.replace(/\s+/g, " ").trim();
  const parts = flat.split(/(?<=[.!?])\s+(?=[A-Z0-9"'(])/);
  return parts
    .map((p) => p.trim())
    .filter((p) => {
      if (p.length < MIN_LEN || p.length > MAX_LEN) return false;
      if (p.split(/\s+/).length < MIN_WORDS) return false;
      if (!/[.!]$/.test(p)) return false;
      if (p.includes("?")) return false;
      if (!/^[A-Z0-9"'(]/.test(p)) return false;
      if (DEPENDENT_START.test(p)) return false;
      if (META.test(p)) return false;
      return true;
    });
}

const ANTONYM_PAIRS: [string, string][] = [
  ["increases", "decreases"], ["increase", "decrease"], ["increasing", "decreasing"], ["increased", "decreased"],
  ["higher", "lower"], ["highest", "lowest"], ["more", "less"], ["larger", "smaller"], ["greater", "smaller"],
  ["before", "after"], ["first", "last"], ["always", "never"], ["all", "some"], ["every", "some"],
  ["positive", "negative"], ["maximum", "minimum"], ["maximises", "minimises"], ["maximize", "minimize"],
  ["faster", "slower"], ["stronger", "weaker"], ["upward", "downward"], ["parallel", "sequential"],
  ["expands", "contracts"], ["gains", "loses"], ["absorbs", "releases"], ["independent", "dependent"],
  ["together", "separately"], ["inside", "outside"], ["above", "below"], ["early", "late"], ["fixed", "learned"],
  ["true", "false"], ["sum", "difference"], ["whole", "part"], ["direct", "indirect"], ["simple", "complex"],
];

const ANTONYMS = new Map<string, string>();
for (const [a, b] of ANTONYM_PAIRS) {
  ANTONYMS.set(a, b);
  if (!ANTONYMS.has(b)) ANTONYMS.set(b, a);
}

const NUMBER_WORDS = ["two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "twelve"];

const matchCase = (from: string, to: string): string =>
  from[0] === from[0].toUpperCase() && from[0] !== from[0].toLowerCase() ? to[0].toUpperCase() + to.slice(1) : to;

type Alt = { text: string; alteration: ClaimAlteration };

function antonymAlt(s: string, rng: () => number): Alt[] {
  const found: { word: string; at: number }[] = [];
  for (const m of s.matchAll(/\b[A-Za-z]+\b/g)) {
    if (ANTONYMS.has(m[0].toLowerCase())) found.push({ word: m[0], at: m.index ?? 0 });
  }
  return shuffled(found, rng).map(({ word, at }) => {
    const to = matchCase(word, ANTONYMS.get(word.toLowerCase())!);
    return { text: s.slice(0, at) + to + s.slice(at + word.length), alteration: { kind: "antonym" as const, from: word, to } };
  });
}

function numberAlt(s: string, rng: () => number): Alt[] {
  const out: Alt[] = [];
  const digit = s.match(/\b\d+(?:\.\d+)?\b/);
  if (digit) {
    const n = Number(digit[0]);
    const choices = [n + 1, n * 2, n > 1 ? n - 1 : n + 2].filter((v) => v !== n);
    const to = String(pick(choices, rng));
    out.push({ text: s.replaceAll(new RegExp(`\\b${digit[0].replace(".", "\\.")}\\b`, "g"), to), alteration: { kind: "number", from: digit[0], to } });
  }
  const word = s.match(new RegExp(`\\b(${NUMBER_WORDS.join("|")})\\b`, "i"));
  if (word) {
    const low = word[0].toLowerCase();
    const others = NUMBER_WORDS.filter((w) => w !== low);
    const to = matchCase(word[0], pick(others, rng));
    out.push({ text: s.replaceAll(new RegExp(`\\b${word[0]}\\b`, "g"), to), alteration: { kind: "number", from: word[0], to } });
  }
  return out;
}

const AUX = "is|are|was|were|does|do|did|can|will|would|should|could|has|have|must";

/** Words after an auxiliary that mean it opens a question or an inverted clause, where "not" would not read. */
const NOT_A_VERB_NEXT = /^(?:this|that|the|a|an|these|those|each|every|it|they|we|you|i|he|she|there|one|any|some|all|other|another|my|your|our|their|his|her|its)\b/i;

function negationAlt(s: string): Alt[] {
  const removed = s.match(new RegExp(`\\b(${AUX})\\s+not\\b\\s?`, "i"));
  if (removed && removed.index !== undefined) {
    const to = removed[1];
    return [{ text: s.slice(0, removed.index) + to + " " + s.slice(removed.index + removed[0].length), alteration: { kind: "negation", from: removed[0].trim(), to } }];
  }
  const cannot = s.match(/\bcannot\b/i);
  if (cannot && cannot.index !== undefined) {
    const to = matchCase(cannot[0], "can");
    return [{ text: s.slice(0, cannot.index) + to + s.slice(cannot.index + cannot[0].length), alteration: { kind: "negation", from: cannot[0], to } }];
  }
  const aux = [...s.matchAll(new RegExp(`\\b(${AUX})\\b(?!\\s+not\\b)`, "gi"))].find((m) => {
    const after = s.slice((m.index ?? 0) + m[0].length).trimStart();
    const before = s.slice(0, m.index ?? 0);
    return after.length > 0 && !NOT_A_VERB_NEXT.test(after) && !/[('"‘“][^'")]*$/.test(before);
  });
  if (aux && aux.index !== undefined) {
    const word = aux[1];
    const to = word.toLowerCase() === "can" ? matchCase(word, "cannot") : `${word} not`;
    return [{ text: s.slice(0, aux.index) + to + s.slice(aux.index + word.length), alteration: { kind: "negation", from: word, to } }];
  }
  return [];
}

function swapAlt(s: string, concepts: readonly { id: string; name: string }[], ownId: string, rng: () => number): Alt[] {
  const swappable = (name: string) => name.length >= 4 && name.length <= 20 && !/[,]| vs | and /i.test(name);
  const others = concepts.filter((c) => c.id !== ownId && swappable(c.name));
  if (others.length === 0) return [];
  const out: Alt[] = [];
  for (const c of concepts) {
    if (!swappable(c.name)) continue;
    const esc = c.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const m = s.match(new RegExp(`\\b${esc}\\b`, "i"));
    if (!m || m.index === undefined) continue;
    const pool = others.filter((o) => o.id !== c.id && !s.toLowerCase().includes(o.name.toLowerCase()));
    if (pool.length === 0) continue;
    const target = pick(pool, rng).name;
    const lowered = m[0][0] === m[0][0].toLowerCase() && /^[A-Z][a-z]/.test(target) ? target[0].toLowerCase() + target.slice(1) : target;
    out.push({ text: s.slice(0, m.index) + lowered + s.slice(m.index + m[0].length), alteration: { kind: "swap", from: m[0], to: lowered } });
  }
  return out;
}

/**
 * True when the code-side guard would let a quote of `source` contradict `claim`:
 * the two are about the same thing and either differ in polarity or each carry
 * a content word the other lacks.
 */
export function guardBacksBluff(claim: string, source: string): boolean {
  if (!overlapsClaim(claim, source)) return false;
  const pol = polarityOf(claim, [source]);
  return pol.relevant > 0 && (pol.differs || pol.substitution);
}

/** True when the guard would let a quote of `source` support `claim`. */
export function guardBacksReal(claim: string, source: string): boolean {
  if (!overlapsClaim(claim, source)) return false;
  const pol = polarityOf(claim, [source]);
  return pol.relevant > 0 && !pol.differs;
}

/**
 * One changed fact in a page sentence, or null when no change survives the guard
 * and the checks below. Subtle changes (a swapped word, number or concept)
 * are tried before a plain negation, which is the easiest to spot.
 */
export function alterSentence(
  sentence: string,
  concepts: readonly { id: string; name: string }[],
  ownConceptId: string,
  rng: () => number,
  pageText: string
): Alt | null {
  const subtle = [...antonymAlt(sentence, rng), ...numberAlt(sentence, rng), ...swapAlt(sentence, concepts, ownConceptId, rng)];
  const blunt = negationAlt(sentence);
  const flat = pageText.replace(/\s+/g, " ");
  for (const alt of [...shuffled(subtle, rng), ...blunt]) {
    if (alt.text === sentence) continue;
    if (flat.includes(alt.text)) continue; // the page really says it
    if (!guardBacksBluff(alt.text, sentence)) continue;
    return alt;
  }
  return null;
}

/** Chunks a concept owns, by where its name and description show up. Deterministic. */
export function assignChunks(concepts: readonly ConceptDef[], chunks: readonly SourceChunk[]): Map<string, SourceChunk[]> {
  const owned = new Map<string, SourceChunk[]>(concepts.map((c) => [c.id, []]));
  if (concepts.length === 0) return owned;
  const scoreOf = (c: ConceptDef, chunk: SourceChunk): number => {
    const text = chunk.text.toLowerCase();
    const section = (chunk.locator.section ?? "").toLowerCase();
    const ct = new Set(tokens(chunk.text));
    let score = 0;
    for (const term of [c.name, ...c.aliases]) {
      const t = term.toLowerCase().trim();
      if (t.length >= 4 && text.includes(t)) score += t === c.name.toLowerCase() ? 4 : 2;
      if (t.length >= 4 && section.includes(t)) score += 3;
    }
    for (const w of tokens(c.name)) if (ct.has(w)) score += 1.5;
    for (const w of new Set(tokens(c.description))) if (ct.has(w)) score += 0.4;
    return score;
  };
  const best = new Map<string, { id: string; score: number }>();
  for (const chunk of chunks) {
    let top = { id: concepts[0].id, score: 0 };
    for (const c of concepts) {
      const s = scoreOf(c, chunk);
      if (s > top.score) top = { id: c.id, score: s };
    }
    best.set(chunk.id, top);
  }
  let last = concepts[0].id;
  for (const chunk of chunks) {
    const top = best.get(chunk.id)!;
    const id = top.score > 0 ? top.id : last;
    last = id;
    owned.get(id)!.push(chunk);
  }
  // A concept no passage chose still gets the two passages that mention it most.
  for (const c of concepts) {
    if ((owned.get(c.id) ?? []).length > 0) continue;
    const ranked = chunks.map((chunk) => ({ chunk, s: scoreOf(c, chunk) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 2);
    owned.set(c.id, ranked.map((x) => x.chunk));
  }
  return owned;
}

export type RealClaim = { conceptId: string; text: string; passageId: string; page: number | null; chunkText: string };

/** Every sentence a concept can be quizzed on, in page order. */
export function realClaims(conceptId: string, owned: readonly SourceChunk[]): RealClaim[] {
  const seen = new Set<string>();
  const out: RealClaim[] = [];
  for (const chunk of owned) {
    for (const text of sentencesOf(chunk.text)) {
      if (seen.has(text)) continue;
      seen.add(text);
      out.push({ conceptId, text, passageId: chunk.id, page: chunk.locator.page ?? null, chunkText: chunk.text });
    }
  }
  return out;
}

const overlapScore = (sentence: string, reference: Set<string>): number => {
  let n = 0;
  for (const w of new Set(tokens(sentence))) if (reference.has(w)) n += 1;
  return n;
};

/**
 * A course Trap as a bluff, with the page sentence that corrects it. Null when
 * no passage says the correct fact (a bluff with no page behind it is not fair).
 */
export function trapClaim(trap: Trap, chunks: readonly SourceChunk[]): CatchItem | null {
  const reference = new Set(tokens(`${trap.correct} ${trap.whyWrong}`));
  let best: { s: string; chunk: SourceChunk; score: number } | null = null;
  for (const chunk of chunks) {
    for (const s of sentencesOf(chunk.text)) {
      const score = overlapScore(s, reference);
      if (score > (best?.score ?? 0)) best = { s, chunk, score };
    }
  }
  if (!best || best.score < 3) return null;
  return {
    type: "catch",
    conceptId: trap.conceptId,
    claim: trap.statement.trim(),
    isBluff: true,
    source: best.s,
    passageId: best.chunk.id,
    page: best.chunk.locator.page ?? null,
    alteration: { kind: "trap", from: trap.correct.trim(), to: trap.statement.trim() },
    trapId: trap.id,
  };
}

export function realItem(c: RealClaim): CatchItem {
  return { type: "catch", conceptId: c.conceptId, claim: c.text, isBluff: false, source: c.text, passageId: c.passageId, page: c.page, alteration: null };
}

export function bluffItem(c: RealClaim, alt: Alt): CatchItem {
  return { type: "catch", conceptId: c.conceptId, claim: alt.text, isBluff: true, source: c.text, passageId: c.passageId, page: c.page, alteration: alt.alteration };
}

