import { failureViewFor, type FailureView } from "@/components/oral/model";

/** The session URL for a level. `closedRounds` is what the screen has already scored, so a reconnect resumes there. */
export function levelSessionUrl(subjectId: string, levelId: string, closedRounds: number): string {
  const base = `/api/oral/session?subjectId=${encodeURIComponent(subjectId)}&levelId=${encodeURIComponent(levelId)}`;
  return closedRounds > 0 ? `${base}&from=${closedRounds}` : base;
}

/**
 * Shown when the voice session closes while the level is still being played.
 * The card offers "Try again" (reconnect, resuming at the next round) and
 * "Play by typing"; rounds already scored are kept either way.
 */
export function sessionEndedView(closedRounds: number, totalRounds: number): FailureView {
  return {
    ...failureViewFor("session_ended_early"),
    title: "The voice session ended",
    message: `The voice session ended before the level did. Your ${closedRounds} finished ${closedRounds === 1 ? "round is" : "rounds are"} kept. Reconnect to carry on from round ${closedRounds + 1} of ${totalRounds}, or type the rest.`,
    actions: ["retry", "type"],
  };
}
