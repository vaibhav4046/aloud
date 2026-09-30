import type { Level } from "@/lib/game/types";

/**
 * The level block appended to the examiner's system prompt, and the spoken
 * opening line. Questions and claims come from the level's own items, written
 * in code from the player's pages, so the examiner never invents one. The
 * block never says which claim is a bluff: the examiner does not know.
 */

export const LEVEL_MARKER = "THIS LEVEL:";

export function buildLevelPrompt(level: Level): string {
  const items = level.items ?? [];
  const head = `${LEVEL_MARKER} ${level.title}. It has ${level.rounds} rounds and the player has ${level.hearts} hearts. This overrides the usual question limit: after round ${level.rounds}, say one short closing line and stop.`;
  if (level.kind === "catch") {
    const claims = items.map((it, i) => (it.type === "catch" ? `Claim ${i + 1}: ${it.claim}` : "")).filter(Boolean);
    return [
      head,
      "Each round, say the next claim below word for word, then stop and wait. Do not say whether it is true. Do not hint. The player answers that it is real or a bluff.",
      "When the player has answered, say only a short acknowledgement. The screen shows the result. Then read the next claim.",
      ...claims,
    ].join("\n");
  }
  const qs = items.map((it, i) => (it.type === "say" ? `Question ${i + 1}: ${it.question}` : "")).filter(Boolean);
  return [
    head,
    "Ask the questions below in order, one per round, word for word. After the player answers, call grade_my_answer with the question and the answer, and call verify_claim with the player's exact words. Then give one short sentence of feedback and ask the next question.",
    ...qs,
  ].join("\n");
}

export function levelGreeting(level: Level): string {
  const first = level.items?.[0];
  if (first?.type === "catch") return `Bluff check. I will read a claim. Tell me if it is real or a bluff. Claim one: ${first.claim}`;
  if (first?.type === "say") return `${level.title}. ${first.question}`;
  return `${level.title}. Let us begin.`;
}
