import type { ConceptDef, Course } from "@/lib/courses/types";
import type { SourceChunk } from "@/lib/types";
import { alterSentence, assignChunks, bluffItem, realClaims, realItem, trapClaim, type RealClaim } from "./claims";
import { seeded, shortHash, shuffled } from "./hash";
import { heartsForLevel } from "./scoring";
import type { CatchItem, Difficulty, Level, LevelItem, LevelKind, Progress, Run, SayItem, World } from "./types";

/**
 * Turn a subject's own material into a Run of 12 to 30 levels.
 *
 * Pure and deterministic: the same subject and options give the same Run, byte
 * for byte. Nothing here reads a clock or Math.random; a seeded generator keyed
 * on ids and page sentences makes every "random" choice repeatable.
 *
 * Size comes from the material. Each concept can give Say levels (its course
 * exam questions plus generated recall, why, apply and compare questions) and
 * Catch levels (three page claims, at least one real and one bluff). Each world
 * of about four playable levels ends in a Boss. Nothing is repeated to fill a
 * quota: the first plan that reaches 12 levels wins. When even the fullest plan
 * stays under 12 (a subject with no usable page sentences), the run is returned
 * short and says so with `thin: true`.
 */

export const MIN_LEVELS = 12;
export const MAX_LEVELS = 30;
export const LEVELS_PER_WORLD = 5;
/** Playable (non boss) levels per world, so a world with its boss holds about LEVELS_PER_WORLD. */
const CONTENT_PER_WORLD = LEVELS_PER_WORLD - 1;
const MAX_RECALL_LEVELS = 3;
const MAX_CONCEPTS_IN_RUN = 12;
const EPOCH = "1970-01-01T00:00:00.000Z";

export type RunSource = Pick<Course, "id" | "title" | "concepts" | "sources" | "examQuestions" | "traps" | "explainers">;

export function findLevel(run: Run, levelId: string): Level | null {
  return run.levels.find((l) => l.id === levelId) ?? null;
}

type Draft = { id: string; kind: LevelKind; conceptIds: string[]; items: LevelItem[]; title: string; blurb: string };

/* ---------- say items ---------- */

function firstWords(text: string, n: number): string {
  return text.trim().split(/\s+/).slice(0, n).join(" ");
}

function sayCandidates(concept: ConceptDef, subject: RunSource, all: readonly ConceptDef[]): SayItem[] {
  const own = subject.examQuestions.filter((q) => q.conceptId === concept.id);
  const items: SayItem[] = own.map((q) => ({
    type: "say",
    conceptId: concept.id,
    question: q.question.trim(),
    hint: q.hint?.trim() || `It starts like this: ${firstWords(concept.description, 6)}`,
    focus: "exam",
  }));
  const hint = `It starts like this: ${firstWords(concept.description, 6)}`;
  if (items.length === 0) {
    items.push({ type: "say", conceptId: concept.id, question: `In your own words, what is ${concept.name}?`, hint, focus: "recall" });
  }
  items.push({ type: "say", conceptId: concept.id, question: `Why does ${concept.name} matter? Give the reason, not only the definition.`, hint: "Say what would go wrong without it.", focus: "why" });
  items.push({ type: "say", conceptId: concept.id, question: `Give a case where ${concept.name} shows up, and say what it does there.`, hint: "Pick one concrete situation from your notes.", focus: "apply" });
  const other = concept.related.map((id) => all.find((c) => c.id === id)).find((c): c is ConceptDef => Boolean(c));
  if (other) {
    items.push({ type: "say", conceptId: concept.id, question: `How is ${concept.name} different from ${other.name}?`, hint: "Say what each one does, then what separates them.", focus: "why" });
  }
  return items;
}

function splitEvenly<T>(list: readonly T[], parts: number): T[][] {
  const out: T[][] = [];
  const base = Math.floor(list.length / parts);
  let extra = list.length % parts;
  let at = 0;
  for (let i = 0; i < parts; i++) {
    const size = base + (extra > 0 ? 1 : 0);
    if (extra > 0) extra -= 1;
    out.push(list.slice(at, at + size));
    at += size;
  }
  return out.filter((p) => p.length > 0);
}

function sayLevels(concept: ConceptDef, candidates: SayItem[], tierCap: number): Draft[] {
  const tiers = Math.max(1, Math.min(tierCap, Math.floor(candidates.length / 2)));
  return splitEvenly(candidates, tiers).map((items, i) => ({
    id: `l_say_${concept.id}_${i + 1}`,
    kind: "say" as const,
    conceptIds: [concept.id],
    items,
    title: concept.name,
    blurb: `Say what ${concept.name} is and why it matters.`,
  }));
}

/* ---------- catch items ---------- */

/** Most levels one concept may give of one kind. Raised only when the smaller plan falls short of 12 levels. */
type Config = { tierCap: number };
const CONFIGS: Config[] = [{ tierCap: 2 }, { tierCap: 3 }, { tierCap: 4 }];

type CatchPool = { conceptId: string; traps: CatchItem[]; reals: RealClaim[] };

type Alteration = ReturnType<typeof alterSentence>;

function catchLevels(
  concept: ConceptDef,
  pool: CatchPool,
  cfg: Config,
  ctx: { subjectId: string; concepts: readonly ConceptDef[]; pageText: string }
): Draft[] {
  const drafts: Draft[] = [];
  const usedReal = new Set<string>();
  const usedTrap = new Set<string>();
  const altCache = new Map<string, Alteration>();
  const altFor = (r: RealClaim): Alteration => {
    if (!altCache.has(r.text)) altCache.set(r.text, alterSentence(r.text, ctx.concepts, concept.id, seeded(`${ctx.subjectId}|alt|${r.text}`), ctx.pageText));
    return altCache.get(r.text) ?? null;
  };
  for (let tier = 1; tier <= cfg.tierCap; tier++) {
    const rng = seeded(`${ctx.subjectId}|catch|${concept.id}|${tier}`);
    const freeTraps = pool.traps.filter((t) => !usedTrap.has(t.trapId ?? t.claim));
    const freeReals = pool.reals.filter((r) => !usedReal.has(r.text));
    const bluffable = shuffled(freeReals, rng).map((r) => ({ r, alt: altFor(r) })).filter((x) => x.alt !== null);
    const total = freeTraps.length + freeReals.length;
    const rounds = Math.min(3, total);
    if (rounds < 2 || freeReals.length < 1 || freeTraps.length + bluffable.length < 1) break;
    const wantBluffs = rounds === 2 ? 1 : rng() < 0.5 ? 1 : 2;
    const items: CatchItem[] = [];
    const takenReal = new Set<string>();
    // Bluffs: course traps first, then altered page sentences.
    for (const t of freeTraps) {
      if (items.length >= wantBluffs) break;
      items.push(t);
      takenReal.add(t.source);
      usedTrap.add(t.trapId ?? t.claim);
    }
    for (const { r, alt } of bluffable) {
      if (items.length >= wantBluffs) break;
      if (!alt || takenReal.has(r.text)) continue;
      items.push(bluffItem(r, alt));
      takenReal.add(r.text);
      usedReal.add(r.text);
    }
    if (items.length === 0) break;
    for (const r of freeReals) {
      if (items.length >= rounds) break;
      if (takenReal.has(r.text)) continue;
      items.push(realItem(r));
      usedReal.add(r.text);
    }
    if (!items.some((i) => !i.isBluff) || items.length < 2) break;
    drafts.push({
      id: `l_catch_${concept.id}_${tier}`,
      kind: "catch",
      conceptIds: [concept.id],
      items: shuffled(items, rng),
      title: `Bluff check: ${concept.name}`,
      blurb: `Some claims about ${concept.name} are real. Some are planted.`,
    });
  }
  return drafts;
}

/* ---------- planning ---------- */

function capContent(a: number): number {
  let n = a;
  while (n > 0 && n + Math.ceil(n / CONTENT_PER_WORLD) > MAX_LEVELS) n -= 1;
  return n;
}

function chooseConcepts(concepts: readonly ConceptDef[], owned: Map<string, SourceChunk[]>): ConceptDef[] {
  if (concepts.length <= MAX_CONCEPTS_IN_RUN) return concepts.slice();
  const keep = new Set(
    concepts
      .map((c, i) => ({ c, i, n: owned.get(c.id)?.length ?? 0 }))
      .sort((a, b) => b.n - a.n || a.i - b.i)
      .slice(0, MAX_CONCEPTS_IN_RUN)
      .map((x) => x.c.id)
  );
  return concepts.filter((c) => keep.has(c.id));
}

type Plan = { content: Draft[]; thin: boolean; owned: Map<string, SourceChunk[]>; chunks: SourceChunk[] };

function planContent(subject: RunSource, concepts: ConceptDef[], owned: Map<string, SourceChunk[]>, chunks: SourceChunk[], cfg: Config): Draft[] {
  const pageText = chunks.map((c) => c.text).join(" ");
  const ctx = { subjectId: subject.id, concepts: subject.concepts, pageText };
  const perConcept = concepts.map((c) => {
    const say = sayLevels(c, sayCandidates(c, subject, subject.concepts), cfg.tierCap);
    const traps = subject.traps
      .filter((t) => t.conceptId === c.id)
      .map((t) => trapClaim(t, chunks))
      .filter((t): t is CatchItem => t !== null);
    const catches = catchLevels(c, { conceptId: c.id, traps, reals: realClaims(c.id, owned.get(c.id) ?? []) }, cfg, ctx);
    return { say, catches };
  });
  const out: Draft[] = [];
  for (let tier = 0; tier < cfg.tierCap; tier++) {
    for (const p of perConcept) {
      if (p.say[tier]) out.push(p.say[tier]);
      if (p.catches[tier]) out.push(p.catches[tier]);
    }
  }
  return out;
}

function plan(subject: RunSource): Plan {
  const chunks = subject.sources.flatMap((s) => s.chunks);
  const owned = assignChunks(subject.concepts, chunks);
  const concepts = chooseConcepts(subject.concepts, owned);
  let best: Plan = { content: [], thin: true, owned, chunks };
  for (const cfg of CONFIGS) {
    const content = planContent(subject, concepts, owned, chunks, cfg);
    const trimmed = content.slice(0, capContent(content.length));
    const size = trimmed.length + Math.ceil(trimmed.length / CONTENT_PER_WORLD);
    best = { content: trimmed, thin: size < MIN_LEVELS, owned, chunks };
    if (size >= MIN_LEVELS) break;
  }
  return best;
}

/* ---------- assembly ---------- */

function difficultyAt(position: number, size: number): Difficulty {
  return Math.min(5, 1 + Math.floor((position * 5) / Math.max(1, size))) as Difficulty;
}

type BossSource = { subject: RunSource; owned: Map<string, SourceChunk[]>; chunks: SourceChunk[] };

const normText = (t: string): string => t.replace(/\s+/g, " ").trim().toLowerCase();

/**
 * Claims for a boss that the world's Catch levels have not already shown. A
 * claim the player saw revealed (as stated, or as the page line behind it) is
 * skipped, so the boss draws unused real sentences, unused course traps and
 * fresh alterations of unused sentences. One bluff is reserved first; with no
 * fresh bluff or no fresh real claim there are no claim rounds at all.
 */
function bossClaims(worldIndex: number, worldLevels: Draft[], want: number, src: BossSource): CatchItem[] {
  const conceptIds = [...new Set(worldLevels.flatMap((d) => d.conceptIds))];
  const shownItems = worldLevels.filter((d) => d.kind === "catch").flatMap((d) => d.items as CatchItem[]);
  const shown = new Set(shownItems.flatMap((i) => [normText(i.claim), normText(i.source)]));
  const usedTraps = new Set(shownItems.map((i) => i.trapId).filter((t): t is string => Boolean(t)));
  const rng = seeded(`boss|${worldIndex}|fresh|${conceptIds.join(",")}`);
  const pageText = src.chunks.map((c) => c.text).join(" ");

  const traps = src.subject.traps
    .filter((t) => conceptIds.includes(t.conceptId) && !usedTraps.has(t.id))
    .map((t) => trapClaim(t, src.chunks))
    .filter((t): t is CatchItem => t !== null && !shown.has(normText(t.claim)) && !shown.has(normText(t.source)));
  const reals = shuffled(
    conceptIds.flatMap((id) => realClaims(id, src.owned.get(id) ?? [])).filter((r) => !shown.has(normText(r.text))),
    rng
  );

  const wantBluffs = Math.max(1, Math.floor(want / 2));
  const bluffs: CatchItem[] = [];
  const takenSources = new Set<string>();
  for (const t of shuffled(traps, rng)) {
    if (bluffs.length >= wantBluffs) break;
    bluffs.push(t);
    takenSources.add(normText(t.source));
  }
  for (const r of reals) {
    if (bluffs.length >= wantBluffs) break;
    if (takenSources.has(normText(r.text))) continue;
    const alt = alterSentence(r.text, src.subject.concepts, r.conceptId, seeded(`${src.subject.id}|boss-alt|${r.text}`), pageText);
    if (!alt) continue;
    bluffs.push(bluffItem(r, alt));
    takenSources.add(normText(r.text));
  }
  const realItems = reals.filter((r) => !takenSources.has(normText(r.text))).slice(0, Math.max(0, want - bluffs.length)).map(realItem);
  if (bluffs.length === 0 || realItems.length === 0) return [];
  const order: CatchItem[] = [];
  for (let i = 0; i < Math.max(bluffs.length, realItems.length); i++) {
    if (bluffs[i]) order.push(bluffs[i]);
    if (realItems[i]) order.push(realItems[i]);
  }
  return order;
}

function bossFor(worldIndex: number, worldLevels: Draft[], names: Map<string, string>, src: BossSource): Draft {
  const conceptIds = [...new Set(worldLevels.flatMap((d) => d.conceptIds))];
  const says = worldLevels.flatMap((d) => (d.kind === "say" ? (d.items as SayItem[]) : []));
  const rounds = Math.max(4, Math.min(6, conceptIds.length + 1));
  const rng = seeded(`boss|${worldIndex}|${conceptIds.join(",")}`);
  const catchOrder = bossClaims(worldIndex, worldLevels, Math.ceil(rounds / 2), src);
  const sayOrder = shuffled(says, rng);
  const items: LevelItem[] = [];
  for (let k = 0; items.length < rounds && k < rounds * 4; k++) {
    const pool: LevelItem[] = k % 2 === 0 && catchOrder.length > 0 ? catchOrder : sayOrder.length > 0 ? sayOrder : catchOrder;
    const item = pool[Math.floor(k / 2) % pool.length];
    if (item && !items.includes(item)) items.push(item);
  }
  for (const item of [...catchOrder, ...sayOrder]) if (items.length < 3 && !items.includes(item)) items.push(item);
  const named = conceptIds.slice(0, 3).map((id) => names.get(id) ?? id);
  return {
    id: `l_boss_${worldIndex}`,
    kind: "boss",
    conceptIds,
    items,
    title: `World ${worldIndex} boss`,
    blurb: `A fast round across ${named.join(", ")}.`,
  };
}

function worldName(conceptIds: string[][], names: Map<string, string>): string {
  const distinct = [...new Set(conceptIds.flat())].map((id) => names.get(id) ?? id);
  const label = distinct.length <= 1 ? distinct[0] ?? "Opening" : `${distinct[0]} and ${distinct[1]}`;
  return label.length > 48 ? `${label.slice(0, 47).trimEnd()}...` : label;
}

function worldsOf(levels: Level[], names: Map<string, string>): World[] {
  const byWorld = new Map<number, Level[]>();
  for (const l of levels) byWorld.set(l.world, [...(byWorld.get(l.world) ?? []), l]);
  return [...byWorld.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([index, lv]) => ({
      index,
      name: worldName(lv.filter((l) => l.kind !== "boss").map((l) => l.conceptIds), names),
      levelIds: lv.map((l) => l.id),
    }));
}

/** Build the base run: playable levels grouped into worlds, each closed by a boss. */
function baseRun(subject: RunSource, createdAt: string): Run {
  const { content, thin, owned, chunks } = plan(subject);
  const names = new Map(subject.concepts.map((c) => [c.id, c.name]));
  const worldCount = Math.max(1, Math.ceil(content.length / CONTENT_PER_WORLD));
  const drafts: { d: Draft; world: number }[] = [];
  splitEvenly(content, worldCount).forEach((group, w) => {
    for (const d of group) drafts.push({ d, world: w + 1 });
    drafts.push({ d: bossFor(w + 1, group, names, { subject, owned, chunks }), world: w + 1 });
  });
  const size = drafts.length;
  const levels: Level[] = drafts.map(({ d, world }, i) => ({
    id: d.id,
    index: i + 1,
    world,
    kind: d.kind,
    title: d.title,
    blurb: d.blurb,
    conceptIds: d.conceptIds,
    difficulty: difficultyAt(i, size),
    hearts: heartsForLevel(d.kind, d.items.length),
    rounds: d.items.length,
    items: d.items,
  }));
  return {
    id: `run_${subject.id}`,
    subjectId: subject.id,
    subjectTitle: subject.title,
    levels,
    worlds: worldsOf(levels, names),
    createdAt,
    size,
    thin,
  };
}

/* ---------- recall ---------- */

function recallItems(concept: ConceptDef, subject: RunSource, occurrence: number, all: readonly ConceptDef[]): SayItem[] {
  const c = sayCandidates(concept, subject, all);
  return [c[occurrence % c.length]];
}

function isPlayed(progress: Progress, id: string): boolean {
  return Boolean(progress.results[id]);
}

function renumber(levels: Level[], worlds: World[]): Level[] {
  const order = worlds.flatMap((w) => w.levelIds);
  const byId = new Map(levels.map((l) => [l.id, l]));
  const size = order.length;
  return order.map((id, i) => {
    const l = byId.get(id)!;
    return { ...l, index: i + 1, difficulty: difficultyAt(i, size) };
  });
}

/**
 * Insert Recall levels for the concepts the player missed and has not redeemed.
 * Levels with a result are never touched, so their stars stay where they are;
 * new recall levels go inside the first unfinished worlds, before the boss.
 * Idempotent: a concept already covered by an unplayed recall level is skipped.
 */
export function withRecall(run: Run, subject: RunSource, progress: Progress): Run {
  const known = new Set(subject.concepts.map((c) => c.id));
  const covered = new Set(run.levels.filter((l) => l.kind === "recall" && !isPlayed(progress, l.id)).flatMap((l) => l.conceptIds));
  const weak = progress.weakConceptIds.filter((id) => known.has(id) && !covered.has(id));
  if (weak.length === 0) return run;
  const openWorlds = run.worlds.filter((w) => {
    const boss = run.levels.find((l) => l.kind === "boss" && w.levelIds.includes(l.id));
    return boss ? (progress.results[boss.id]?.stars ?? 0) < 1 : true;
  });
  if (openWorlds.length === 0) return run;
  const slots = MAX_RECALL_LEVELS - run.levels.filter((l) => l.kind === "recall" && !isPlayed(progress, l.id)).length;
  if (slots <= 0) return run;
  const groupCount = Math.min(slots, Math.ceil(weak.length / 3));
  const groups = splitEvenly(weak.slice(0, groupCount * 3), groupCount);

  let levels = run.levels.slice();
  let worlds = run.worlds.map((w) => ({ ...w, levelIds: w.levelIds.slice() }));
  const byId = (id: string) => subject.concepts.find((c) => c.id === id)!;
  groups.forEach((ids, gi) => {
    if (levels.length >= MAX_LEVELS && !dropOne(levels, worlds, progress, (l) => levels = l, (w) => worlds = w)) return;
    const world = worlds.find((w) => w.index === openWorlds[gi % openWorlds.length].index)!;
    const sameSet = levels.filter((l) => l.kind === "recall" && l.id.startsWith(`l_recall_${shortHash(ids.slice().sort().join(","))}`)).length;
    const items = ids.flatMap((id) => recallItems(byId(id), subject, sameSet, subject.concepts));
    const padded = items.length < 2 ? [...items, ...sayCandidates(byId(ids[0]), subject, subject.concepts).filter((c) => !items.includes(c)).slice(0, 1)] : items;
    const names = ids.map((id) => byId(id).name);
    const level: Level = {
      id: `l_recall_${shortHash(ids.slice().sort().join(","))}_${sameSet + 1}`,
      index: 0,
      world: world.index,
      kind: "recall",
      title: `Recall: ${names.slice(0, 2).join(" and ")}`,
      blurb: `Say again what slipped: ${names.slice(0, 3).join(", ")}.`,
      conceptIds: ids,
      difficulty: 1,
      hearts: heartsForLevel("recall", padded.length),
      rounds: padded.length,
      items: padded,
    };
    levels = [...levels, level];
    const bossAt = world.levelIds.findIndex((id) => levels.find((l) => l.id === id)?.kind === "boss");
    world.levelIds.splice(bossAt < 0 ? world.levelIds.length : bossAt, 0, level.id);
  });
  const renumbered = renumber(levels, worlds);
  return { ...run, levels: renumbered, worlds, size: renumbered.length };
}

/** Free one slot at the size cap: the latest unplayed playable level whose concept is covered by another level. */
function dropOne(
  levels: Level[],
  worlds: World[],
  progress: Progress,
  setLevels: (l: Level[]) => void,
  setWorlds: (w: World[]) => void
): boolean {
  const coverage = new Map<string, number>();
  for (const l of levels) for (const c of l.conceptIds) coverage.set(c, (coverage.get(c) ?? 0) + 1);
  const victim = levels
    .filter((l) => (l.kind === "say" || l.kind === "catch") && !isPlayed(progress, l.id) && l.conceptIds.every((c) => (coverage.get(c) ?? 0) >= 2))
    .sort((a, b) => b.index - a.index)
    .find((l) => (worlds.find((w) => w.index === l.world)?.levelIds.length ?? 0) > 2);
  if (!victim) return false;
  setLevels(levels.filter((l) => l.id !== victim.id));
  setWorlds(worlds.map((w) => (w.index === victim.world ? { ...w, levelIds: w.levelIds.filter((id) => id !== victim.id) } : w)));
  return true;
}

/* ---------- entry point ---------- */

export type GenerateOptions = { now?: string; progress?: Progress | null };

/** Build a Run for a subject. See the header for the rules; docs/notes/engine.md for the shapes. */
export function generateRun(subject: RunSource, opts: GenerateOptions = {}): Run {
  const run = baseRun(subject, opts.now ?? EPOCH);
  return opts.progress ? withRecall(run, subject, opts.progress) : run;
}
