import type { Course, Subject } from "@/lib/courses/types";

/** A subject made of `n` concepts, each with `chunksEach` passages of three plain sentences. */
export function synthetic(n: number, chunksEach: number, traps = 0, sentences = 3): Course {
  const concepts = Array.from({ length: n }, (_, i) => ({
    id: `c${i}`, name: `Widget${String.fromCharCode(65 + i)}`, aliases: [], description: `Widget ${i} handles the flow of items through stage ${i} of the line.`, related: i > 0 ? [`c${i - 1}`] : [],
  }));
  const chunks = concepts.flatMap((c, i) =>
    Array.from({ length: chunksEach }, (_, k) => ({
      id: `ch${i}_${k}`, sourceId: "s", ordinal: i * chunksEach + k,
      text: [
        `${c.name} moves items through stage ${i + 2} of the line every cycle.`,
        `${c.name} always keeps the buffer above the minimum level number ${k + 3}.`,
        `Operators usually increase the buffer before the shift ends when ${c.name} runs.`,
      ].slice(0, sentences).join(" "),
      locator: { page: i * chunksEach + k + 1, section: c.name },
    }))
  );
  return {
    id: `course_syn_${n}_${chunksEach}`, code: "SYN", title: "Synthetic", subject: "Test", demo: false,
    sources: [{ id: "s", title: "Notes", type: "notes", chunks }],
    concepts,
    examQuestions: concepts.map((c) => ({ id: `q_${c.id}`, conceptId: c.id, question: `What does ${c.name} do?`, requiredKeywords: [], hint: "Think about the line." })),
    teachback: { keywords: {}, hints: {} },
    explainers: {},
    traps: Array.from({ length: traps }, (_, i) => ({
      id: `t${i}`, conceptId: `c${i % n}`, statement: `${concepts[i % n].name} lets the buffer fall below the minimum level.`,
      whyWrong: `${concepts[i % n].name} keeps the buffer above the minimum level.`, correct: `${concepts[i % n].name} keeps the buffer above the minimum level.`,
    })),
  };
}


/** The synthetic course wearing the shape of a subject a learner built from their own notes. */
export function ownedSubject(ownerId: string, id = "subj_game_probe", n = 6, chunksEach = 2, traps = 2): Subject {
  const course = synthetic(n, chunksEach, traps);
  return {
    ...course, id, title: "Probe notes", demo: false, ownerId, createdAt: "2026-09-30T00:00:00.000Z",
    origin: "paste", builtBy: "reading", keyterms: [], languageCodes: ["en"],
  };
}
