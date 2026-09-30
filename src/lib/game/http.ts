import { checkLimit, limitKey, type LimitClass } from "@/lib/limits";
import { clientIp } from "@/lib/http";
import { err } from "@/lib/types";

/** A run is a few tens of KB and a progress record a few KB. Nothing a client sends here is bigger than this. */
export const MAX_GAME_BODY_BYTES = 64 * 1024;

/** Read at most `max` bytes of the body; null means it was larger. */
export async function readCappedBody(req: Request, max = MAX_GAME_BODY_BYTES): Promise<string | null> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > max) return null;
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** A 429 response when this caller is over budget on either the address or the identity bucket, else null. */
export function rateLimited(req: Request, userId: string, route: string, cls: LimitClass): Response | null {
  for (const key of [limitKey([route, clientIp(req)]), limitKey([`${route}-did`, userId])]) {
    const rl = checkLimit(key, cls);
    if (!rl.ok) {
      return Response.json(
        { error: { code: "RATE_LIMITED", message: "Slow down a little, try again in a moment.", retryable: true } },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSec), "Cache-Control": "no-store" } }
      );
    }
  }
  return null;
}

export const noStore = { headers: { "Cache-Control": "no-store" } } as const;

/** Parse a JSON body with a size cap. Returns the value or the error response to send. */
export async function readJson(req: Request): Promise<{ ok: true; value: unknown } | { ok: false; res: Response }> {
  let text: string | null;
  try {
    text = await readCappedBody(req);
  } catch {
    return { ok: false, res: err("BAD_REQUEST", "Expected JSON.", false, 400) };
  }
  if (text === null) return { ok: false, res: err("PAYLOAD_TOO_LARGE", "That was longer than Aloud takes in one go.", false, 413) };
  try {
    return { ok: true, value: text.length === 0 ? {} : JSON.parse(text) };
  } catch {
    return { ok: false, res: err("BAD_REQUEST", "Expected JSON.", false, 400) };
  }
}
