import { resolveIdentity } from "@/lib/auth/identity";
import { resolveSubject, subjectMissing } from "@/lib/courses/subject";
import { noStore, rateLimited, readJson } from "@/lib/game/http";
import { applyLevelResult, mergeProgress, newProgress } from "@/lib/game/progress";
import { ProgressPostBody } from "@/lib/game/schema";
import { checkResultAgainstLevel, loadRun, progressFor, progressKey, sanitizeForRun, verifiedProofs } from "@/lib/game/service";
import { withIdentityCookie } from "@/lib/http";
import { rid, serverLog } from "@/lib/observe";
import { getStore } from "@/lib/store";
import { err } from "@/lib/types";

/**
 * GET  /api/game/progress?subjectId=   the caller's progress for a subject
 * POST /api/game/progress              body one of
 *   { subjectId?, progress, tz? }            merge this device's copy into the stored one
 *   { subjectId?, result, proofs?, tz? }     apply one finished level
 *
 * Idempotent: posting the same body twice leaves the same stored progress. The
 * server's own clock decides which local day a level counts for (the client only
 * names its time zone), results are checked against the level they claim to be
 * for, and a proof card is stored only when its quote is verbatim in the passage
 * it names.
 *
 * ponytail: read-modify-write with no lock, so two simultaneous posts from two
 * devices can lose one update; the merge on the next post restores it because
 * results and proofs are unions. Add a version column if that ever matters.
 */

const NOT_ALLOWED = (why: string) => err("BAD_REQUEST", `That result is not possible for this level (${why}).`, false, 400);

export async function GET(req: Request): Promise<Response> {
  const traceId = rid();
  const { identity, setCookie } = await resolveIdentity(req);
  const done = (res: Response) => withIdentityCookie(res, setCookie);
  const limited = rateLimited(req, identity.userId, "game-progress", "default");
  if (limited) return done(limited);
  const subjectId = new URL(req.url).searchParams.get("subjectId");
  if (subjectId !== null && subjectId.length > 80) return done(err("BAD_REQUEST", "That subject id is too long.", false, 400));
  try {
    const store = getStore();
    const subject = await resolveSubject(store, identity.userId, subjectId);
    const now = new Date();
    const { run, progress } = await loadRun(store, identity.userId, subject, { now });
    return done(Response.json(progressFor(progress, run, { now }), noStore));
  } catch (e) {
    if (e instanceof Error && e.name === "SubjectNotFoundError") return done(subjectMissing(e));
    serverLog("game_progress.get_failed", traceId, { err: (e as Error).message?.slice(0, 200) ?? "unknown" });
    return done(err("GAME_UNAVAILABLE", "Progress could not be read right now.", true, 503));
  }
}

export async function POST(req: Request): Promise<Response> {
  const traceId = rid();
  const { identity, setCookie } = await resolveIdentity(req);
  const done = (res: Response) => withIdentityCookie(res, setCookie);
  const limited = rateLimited(req, identity.userId, "game-progress-post", "exam");
  if (limited) return done(limited);

  const body = await readJson(req);
  if (!body.ok) return done(body.res);
  const parsed = ProgressPostBody.safeParse(body.value);
  if (!parsed.success) {
    return done(err("BAD_REQUEST", `That request was not shaped the way Aloud expects (${parsed.error.issues[0]?.path.join(".") || "body"}).`, false, 400));
  }
  const input = parsed.data;

  try {
    const store = getStore();
    const subject = await resolveSubject(store, identity.userId, input.subjectId ?? null);
    const ctx = { now: new Date(), tz: input.tz };
    const { run, progress: stored } = await loadRun(store, identity.userId, subject, { now: ctx.now });
    const current = stored ?? newProgress(run.id, ctx);

    let next;
    if ("result" in input) {
      const level = run.levels.find((l) => l.id === input.result.levelId);
      if (!level) return done(err("BAD_REQUEST", "That level is not in this run.", false, 400));
      const problem = checkResultAgainstLevel(input.result, level);
      if (problem) return done(NOT_ALLOWED(problem));
      const proofs = verifiedProofs(input.proofs ?? [], subject, level.id);
      next = applyLevelResult(current, run, input.result, proofs, ctx);
    } else {
      next = mergeProgress(current, sanitizeForRun(input.progress, run), run);
    }
    await store.putGameDoc(identity.userId, progressKey(subject.id), next);
    // Recall levels depend on the weak list, so refresh the stored run with it.
    await loadRun(store, identity.userId, subject, { now: ctx.now });
    return done(Response.json({ progress: next }, noStore));
  } catch (e) {
    if (e instanceof Error && e.name === "SubjectNotFoundError") return done(subjectMissing(e));
    serverLog("game_progress.post_failed", traceId, { err: (e as Error).message?.slice(0, 200) ?? "unknown" });
    return done(err("GAME_UNAVAILABLE", "Progress could not be saved right now.", true, 503));
  }
}

