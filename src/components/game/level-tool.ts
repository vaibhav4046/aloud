import { voiceMessage } from "@/lib/audio/messages";

/** The server's JSON result for one tool call. */
export type ToolResult = Record<string, unknown>;

const TOOL_TIMEOUT_MS = 12_000;

export type LevelToolContext = { subjectId: string; levelId: string; sessionId: string | null };

/** A refusal, an empty body or no result. Every tool refusal carries `error`, and the route answers it with 200. */
export const toolFailed = (result: ToolResult | null): boolean => result === null || result.error !== undefined || Object.keys(result).length === 0;

/**
 * Run one tool on our server, scoped to the level so the examiner's own claims
 * never touch the player's mastery. The voice agent gets the result as it
 * comes back, refusals included, because it can say them aloud.
 */
export async function runLevelTool(name: string, args: Record<string, unknown>, callId: string, ctx: LevelToolContext): Promise<ToolResult> {
  const res = await fetch("/api/oral/tool", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callId, name, arguments: args, subjectId: ctx.subjectId, sessionId: ctx.sessionId, levelId: ctx.levelId }),
    signal: AbortSignal.timeout(TOOL_TIMEOUT_MS),
  });
  const body = (await res.json().catch(() => null)) as { result?: ToolResult; error?: { code?: string } } | null;
  if (!res.ok) throw new Error(voiceMessage(body?.error?.code));
  return body?.result ?? {};
}

/** The typed path has nobody to say a refusal aloud, so a refusal is a failure the screen can offer a retry or a skip for. */
export async function runLevelToolStrict(name: string, args: Record<string, unknown>, callId: string, ctx: LevelToolContext): Promise<ToolResult> {
  const result = await runLevelTool(name, args, callId, ctx);
  if (toolFailed(result)) throw new Error("That answer could not be checked.");
  return result;
}
