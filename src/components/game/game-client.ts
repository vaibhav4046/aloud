"use client";
import type { LevelResult, Progress, ProofCard, Run } from "@/lib/game/types";
import { syncRecord } from "@/components/mirror";

/**
 * Browser side of the game API: fetch a run, keep a copy of it for offline
 * play, and hand progress to the server to merge. Every call has a timeout and
 * a local fallback. Losing the network never costs the player their run: the
 * last run and the progress live in localStorage.
 */

const RUN_PREFIX = "aloud.run.";
const FETCH_TIMEOUT_MS = 20_000;

export class GameApiError extends Error {
  constructor(readonly code: string, message: string, readonly retryable: boolean) {
    super(message);
  }
}

/** A run id is "run_" plus the subject id. The subject id is what the API takes. */
export function subjectIdOfRun(runId: string): string {
  return runId.startsWith("run_") ? runId.slice(4) : runId;
}

export function cacheRun(run: Run): void {
  try {
    window.localStorage.setItem(RUN_PREFIX + run.id, JSON.stringify(run));
  } catch {
    /* storage blocked */
  }
}

export function cachedRun(runId: string): Run | null {
  try {
    const raw = window.localStorage.getItem(RUN_PREFIX + runId);
    return raw ? (JSON.parse(raw) as Run) : null;
  } catch {
    return null;
  }
}

type Envelope = { error?: { code?: string; message?: string; retryable?: boolean } };

async function json<T>(res: Response): Promise<T & Envelope> {
  return ((await res.json().catch(() => null)) ?? {}) as T & Envelope;
}

/** Ask the server for the run. It generates on first call and returns the stored run afterwards. */
export async function fetchRun(subjectId: string | null, opts: { regenerate?: boolean } = {}): Promise<Run> {
  // A subject the browser built may be unknown to this server instance: replay it first.
  if (subjectId) await syncRecord(subjectId).catch(() => null);
  const url = `/api/game/run${subjectId && !opts.regenerate ? `?subjectId=${encodeURIComponent(subjectId)}` : ""}`;
  let res: Response;
  try {
    res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      ...(opts.regenerate
        ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subjectId, regenerate: true }) }
        : {}),
    });
  } catch {
    throw new GameApiError("NETWORK", "The run could not be reached. Check your connection and try again.", true);
  }
  const body = await json<{ run?: Run }>(res);
  if (!res.ok || !body.run) {
    throw new GameApiError(body.error?.code ?? "RUN_FAILED", body.error?.message ?? "The run could not be built from that material.", body.error?.retryable ?? true);
  }
  cacheRun(body.run);
  return body.run;
}

/** Try the network first, then the copy this browser kept. */
export async function loadRun(runId: string): Promise<{ run: Run; offline: boolean }> {
  try {
    return { run: await fetchRun(subjectIdOfRun(runId)), offline: false };
  } catch (e) {
    const kept = cachedRun(runId);
    if (kept) return { run: kept, offline: true };
    throw e;
  }
}

/**
 * Hand progress to the server to merge and take the merged copy back. The
 * merge never lowers XP. On any failure the local copy stands, unchanged.
 */
export async function syncProgress(subjectId: string, progress: Progress, finished?: { result: LevelResult; proofs: ProofCard[] }): Promise<Progress> {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const res = await fetch("/api/game/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(finished ? { subjectId, result: finished.result, proofs: finished.proofs, tz } : { subjectId, progress }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return progress;
    const body = await json<{ progress?: Progress }>(res);
    return body.progress && body.progress.runId === progress.runId ? body.progress : progress;
  } catch {
    return progress;
  }
}

/** Every run and progress copy this browser holds, for the proofs collection and the profile. */
export function readLocalGame(): { runs: Run[]; progress: Progress[] } {
  const runs: Run[] = [];
  const progress: Progress[] = [];
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i) ?? "";
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      if (key.startsWith(RUN_PREFIX)) runs.push(JSON.parse(raw) as Run);
      else if (key.startsWith("aloud.progress.")) progress.push(JSON.parse(raw) as Progress);
    }
  } catch {
    /* storage blocked or a corrupt entry: show what could be read */
  }
  return { runs, progress };
}
