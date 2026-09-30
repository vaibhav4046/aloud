import type { Course, ExamQuestion } from "@/lib/courses/types";
import { tokens } from "@/lib/retrieval";

/**
 * What a spoken or typed answer is graded against.
 *
 * A Say item is either one of the course's own exam questions or a generated
 * one (recall, why, apply, compare). A generated question shares its concept
 * with the course's questions but not their wording, so matching on question
 * text fell through to the course's first exam question and a right answer
 * about one concept was marked against another's keywords. Grading matches on
 * the concept the item belongs to.
 */

export type GradeFocus = { conceptId: string; question: string };

const MAX_KEYWORDS = 6;

const norm = (s: string): string => s.replace(/\s+/g, " ").trim().toLowerCase();

/** Marking words for a concept: its exam questions' own keywords, else content words of its description. */
export function keywordsForConcept(course: Course, conceptId: string): string[] {
  const own = course.examQuestions.filter((q) => q.conceptId === conceptId).flatMap((q) => q.requiredKeywords);
  const fromQuestions = [...new Set(own.map((k) => k.toLowerCase()))];
  if (fromQuestions.length > 0) return fromQuestions.slice(0, MAX_KEYWORDS);
  const concept = course.concepts.find((c) => c.id === conceptId);
  if (!concept) return [];
  const nameWords = new Set(tokens(concept.name));
  return [...new Set(tokens(concept.description))].filter((w) => !nameWords.has(w)).slice(0, MAX_KEYWORDS);
}

/**
 * The question to grade against: the exam question whose text was read back, or
 * a question built for the item's own concept. Null when there is neither, and
 * the caller falls back to the course's first question as it always did.
 */
export function gradeTarget(course: Course, question: string, focus: GradeFocus | null): ExamQuestion | null {
  const exact = course.examQuestions.find((q) => norm(q.question) === norm(question));
  if (exact && (!focus || exact.conceptId === focus.conceptId)) return exact;
  if (!focus) return null;
  const own = course.examQuestions.find((q) => q.conceptId === focus.conceptId);
  const requiredKeywords = keywordsForConcept(course, focus.conceptId);
  if (requiredKeywords.length === 0) return null;
  return {
    id: `focus_${focus.conceptId}`,
    conceptId: focus.conceptId,
    question: focus.question,
    requiredKeywords,
    hint: own?.hint ?? "",
  };
}

/** Which Say item of a level the agent is asking: the exact question, else the closest by shared words. */
export function focusFor(items: readonly { type: string; conceptId: string; question?: string }[], question: string): GradeFocus | null {
  const say = items.filter((i): i is { type: "say"; conceptId: string; question: string } => i.type === "say" && typeof i.question === "string");
  if (say.length === 0) return null;
  const exact = say.find((i) => norm(i.question) === norm(question));
  if (exact) return { conceptId: exact.conceptId, question: exact.question };
  const asked = new Set(tokens(question));
  let best = { item: say[0], score: -1 };
  for (const item of say) {
    const score = tokens(item.question).filter((w) => asked.has(w)).length;
    if (score > best.score) best = { item, score };
  }
  return { conceptId: best.item.conceptId, question: best.item.question };
}
