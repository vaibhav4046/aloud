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

export async function runVoiceTool(c: LevelController, name: string, args: Record<string, unknown>, callId: string, run: ToolRunner): Promise<ToolResult> {
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
