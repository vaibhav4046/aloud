import type { OralState } from "@/lib/oral/machine";

/**
 * The examiner is "quiet" once it has been busy (thinking, checking a page,
 * speaking) and is back to listening. The game waits for that before it swaps a
 * reveal card for the next claim, and before it closes the session after the last
 * round, so the spoken reveal and the closing line are not cut off. Listening
 * before any reply has started is not quiet: the reply to the answer just given
 * has not begun.
 */

const BUSY: ReadonlySet<OralState> = new Set<OralState>(["THINKING", "CHECKING_SOURCE", "SPEAKING"]);

/** The longest a level waits without any examiner activity after its last round before it closes the session. */
export const END_GRACE_MAX_MS = 20_000;
/** Without any sign of a reply the wait is much shorter. */
export const END_GRACE_IDLE_MS = 4_000;

export function quietStep(busySeen: boolean, state: OralState): { busySeen: boolean; quiet: boolean } {
  const busy = busySeen || BUSY.has(state);
  return { busySeen: busy, quiet: busy && state === "LISTENING" };
}
