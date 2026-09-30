import { resolveIdentity } from "@/lib/auth/identity";
import { resolveSubject, subjectMissing } from "@/lib/courses/subject";
import { noStore, rateLimited, readJson } from "@/lib/game/http";
import { RunPostBody } from "@/lib/game/schema";
import { loadRun } from "@/lib/game/service";
import { withIdentityCookie } from "@/lib/http";
import { rid, serverLog } from "@/lib/observe";
import { getStore } from "@/lib/store";
import { err } from "@/lib/types";

/**
 * GET  /api/game/run?subjectId=   the caller's Run for a subject
 * POST /api/game/run              body { subjectId?, regenerate? }
 *
 * The run is built from the caller's own material, stored under their identity,
 * and never shared: a subject id that is not the caller's and not a starter
 * answers 404 exactly like one that does not exist. Generation is
 * deterministic, so a lost stored run rebuilds identically.
 */

async function respond(req: Request, subjectId: string | null, regenerate: boolean, cls: "default" | "exam"): Promise<Response> {
  const traceId = rid();
  const { identity, setCookie } = await resolveIdentity(req);
  const done = (res: Response) => withIdentityCookie(res, setCookie);
  const limited = rateLimited(req, identity.userId, "game-run", cls);
  if (limited) return done(limited);
  try {
    const store = getStore();
    const subject = await resolveSubject(store, identity.userId, subjectId);
    const { run, created } = await loadRun(store, identity.userId, subject, { regenerate, now: new Date() });
    return done(Response.json({ run, created }, noStore));
  } catch (e) {
    if (e instanceof Error && e.name === "SubjectNotFoundError") return done(subjectMissing(e));
    serverLog("game_run.failed", traceId, { err: (e as Error).message?.slice(0, 200) ?? "unknown" });
    return done(err("GAME_UNAVAILABLE", "The run could not be built right now.", true, 503));
  }
}

export async function GET(req: Request): Promise<Response> {
  const subjectId = new URL(req.url).searchParams.get("subjectId");
  if (subjectId !== null && subjectId.length > 80) return err("BAD_REQUEST", "That subject id is too long.", false, 400);
  return respond(req, subjectId, false, "default");
}

export async function POST(req: Request): Promise<Response> {
  const body = await readJson(req);
  if (!body.ok) return body.res;
  const parsed = RunPostBody.safeParse(body.value);
  if (!parsed.success) return err("BAD_REQUEST", `That request was not shaped the way Aloud expects (${parsed.error.issues[0]?.path.join(".") || "body"}).`, false, 400);
  return respond(req, parsed.data.subjectId ?? null, parsed.data.regenerate === true, "exam");
}
