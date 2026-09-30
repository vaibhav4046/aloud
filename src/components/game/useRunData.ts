"use client";
import { useCallback, useEffect, useState } from "react";
import type { Progress, Run } from "@/lib/game/types";
import { GameApiError, loadRun, subjectIdOfRun, syncProgress } from "./game-client";
import { loadProgress, saveProgress } from "./engine-port";

export type RunData =
  | { status: "loading" }
  | { status: "error"; error: GameApiError | Error }
  | { status: "ready"; run: Run; progress: Progress; offline: boolean };

const LAST_KEY = "aloud.lastRun";

export function rememberLastRun(runId: string): void {
  try {
    window.localStorage.setItem(LAST_KEY, runId);
  } catch {
    /* storage blocked */
  }
}

export function lastRunId(): string | null {
  try {
    return window.localStorage.getItem(LAST_KEY);
  } catch {
    return null;
  }
}

/**
 * Load a run and the player's progress for it. The run comes from the server
 * (or the copy this browser kept when offline), progress from localStorage,
 * then the server merge is applied in the background and adopted only when it
 * has at least as much XP, so a slow or failed sync never moves the player back.
 */
export function useRunData(runId: string): RunData & { reload: () => void; commit: (p: Progress) => void } {
  const [data, setData] = useState<RunData>({ status: "loading" });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let live = true;
    setData({ status: "loading" });
    // No run id yet (the caller is still reading it from storage): wait, do not fetch the default run.
    if (!runId) return;
    void loadRun(runId)
      .then(({ run, offline }) => {
        if (!live) return;
        rememberLastRun(run.id);
        const local = loadProgress(run);
        setData({ status: "ready", run, progress: local, offline });
        if (offline) return;
        void syncProgress(subjectIdOfRun(run.id), local).then((merged) => {
          if (!live || merged === local || merged.xp < local.xp) return;
          saveProgress(merged);
          setData((d) => (d.status === "ready" ? { ...d, progress: merged } : d));
        });
      })
      .catch((error: Error) => live && setData({ status: "error", error }));
    return () => {
      live = false;
    };
  }, [runId, nonce]);

  const commit = useCallback((p: Progress) => {
    saveProgress(p);
    setData((d) => (d.status === "ready" ? { ...d, progress: p } : d));
  }, []);

  return { ...data, reload: () => setNonce((n) => n + 1), commit };
}
