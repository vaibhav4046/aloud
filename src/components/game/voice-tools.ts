import type { LevelController } from "./level-controller";

/**
 * Runs one tool call the Voice Agent made during a level, and feeds the result
 * to the round controller.
 *
 * A spoken Say round is graded by grade_my_answer, but the examiner only
 * sometimes also asks the page checker about the player's words (its prompt says
 * "may"). Typed play always does, so a spoken answer never earned a proof card or
 * the grounded bonus. Here the client asks the checker itself, at the same time
 * as the grade, on the exact answer text the model graded. The model gets its
 * grade at once; the round closes when both have landed, with the check first so
 * the proof is in the draft when the grade closes it.
 */

export type ToolResult = Record<string, unknown>;
export type ToolRunner = (name: string, args: Record<string, unknown>, callId: string) => Promise<ToolResult>;

/** How long a verify_claim on a stated claim waits for a transcript that is still on its way. */
export const OPEN_ROUND_GRACE_MS = 1_200;

const ROUND_OPEN = {
  round: "open",
  instruction:
    "The game has not closed this round: it did not catch a real or bluff answer from the player. Do not reveal, do not say which it is, and do not go to the next claim. Say only: real or bluff? Then wait. Call verify_claim again on the same claim after the player answers.",
};

/**
 * The game, not the examiner, decides when a claim round is over. The examiner's
 * verify_claim on a stated claim comes back with `round: "closed"` and the verdict
 * once the game holds the player's stance, and with `round: "open"` and no verdict
 * before that. The examiner's rules say to reveal and go on only after "closed".
 */
async function runClaimTool(c: LevelController, args: Record<string, unknown>, callId: string, run: ToolRunner, graceMs: number): Promise<ToolResult> {
  const idx = c.claimIndex(String(args.claim ?? ""));
  const result = await run("verify_claim", args, callId);
  if (idx >= 0 && idx === c.index) c.tool("verify_claim", args, result);
  await c.whenClosed(idx, graceMs);
  return c.isClosed(idx) ? { ...result, round: "closed" } : ROUND_OPEN;
}

export async function runVoiceTool(c: LevelController, name: string, args: Record<string, unknown>, callId: string, run: ToolRunner, graceMs = OPEN_ROUND_GRACE_MS): Promise<ToolResult> {
  if (name === "verify_claim" && typeof args.claim === "string" && c.claimIndex(args.claim) >= 0) return runClaimTool(c, args, callId, run, graceMs);
  const item = c.item;
  const answer = typeof args.answer === "string" ? args.answer.trim() : "";
  const wantCheck = name === "grade_my_answer" && item?.type === "say" && answer.length > 0;
  const idx = c.index;
  const conceptId = item?.conceptId ?? "";
  const checkArgs = { claim: answer, concept: conceptId };
  // ponytail: one extra checker call per spoken Say round; skip it if latency matters more than proof cards.
  const check = wantCheck ? run("verify_claim", checkArgs, `${callId}_check`).catch(() => null) : null;

  const result = await run(name, args, callId);
  if (!check) {
    c.tool(name, args, result);
    return result;
  }
  void check.then((verdict) => {
    if (c.index !== idx) return;
    if (verdict) c.tool("verify_claim", checkArgs, verdict);
    c.tool(name, args, result);
  });
  return result;
}
