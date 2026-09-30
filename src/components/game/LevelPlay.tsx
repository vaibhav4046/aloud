"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Level, LevelResult, Progress, ProofCard, Run } from "@/lib/game/types";
import { PlayScreen } from "./PlayScreen";
import { ResultView } from "./ResultView";
import { useLevelSession } from "./useLevelSession";
import { applyResult, clockNow, finishLevel, mergeProgress, rankInfo } from "./engine-port";
import { rollCrate, XP_CRATE, MAX_FREEZES, type Crate } from "./result-model";
import { prefersReducedMotion, useSettings } from "./settings";
import { subjectIdOfRun, syncProgress } from "./game-client";
import { OfflineBanner } from "./StateViews";

type Finished = {
  result: LevelResult;
  proofs: ProofCard[];
  xpFrom: number;
  xpTo: number;
  rankBefore: number;
  rankAfter: number;
  freezeEarned: boolean;
  crate: Crate | null;
};

/**
 * One level from the intro to the result. The session hook plays it; when the
 * level ends this folds the result into the player's progress once, saves it,
 * hands it to the server to merge, and swaps the screen for the result view.
 */
export function LevelPlay({ run, level, progress, commit, onRetry }: { run: Run; level: Level; progress: Progress; commit: (p: Progress) => void; onRetry: () => void }) {
  const router = useRouter();
  const [settings] = useSettings();
  const v = useLevelSession({ run, level, settings });
  const [finished, setFinished] = useState<Finished | null>(null);
  const applied = useRef(false);
  const progressRef = useRef(progress);
  progressRef.current = progress;
  const world = run.worlds.find((w) => w.index === level.world);
  const reduced = prefersReducedMotion(settings);

  // The last round's reveal or proof card is shown before the result replaces the screen.
  const settled = (v.play.phase === "won" || v.play.phase === "lost") && !v.reveal && !v.proofView;

  useEffect(() => {
    if (!settled || applied.current) return;
    applied.current = true;
    const before = progressRef.current;
    const ctx = clockNow();
    const playedAt = ctx.now.toISOString();
    const { result, proofs } = finishLevel(v.play.run, { playedAt });
    const a = applyResult(before, run, result, proofs, ctx);
    const crate = rollCrate({
      seed: `${level.id}:${playedAt}`,
      stars: result.stars,
      won: result.outcome === "won",
      freezes: a.progress.freezes,
      facts: [...a.progress.proofs, ...proofs],
    });
    commit(a.progress);
    setFinished({
      result,
      proofs,
      xpFrom: before.xp,
      xpTo: a.progress.xp,
      rankBefore: a.rankBefore,
      rankAfter: a.rankAfter,
      freezeEarned: a.freezeEarned,
      crate,
    });
    void syncProgress(subjectIdOfRun(run.id), a.progress, { result, proofs }).then((serverCopy) => {
      if (serverCopy !== a.progress) commit(mergeProgress(a.progress, serverCopy, run));
    });
  }, [settled, v.play.run, run, level, commit]);

  const onCrate = useCallback(
    (c: Crate) => {
      const p = progressRef.current;
      if (c.kind === "freeze") commit({ ...p, freezes: Math.min(MAX_FREEZES, p.freezes + 1) });
      else if (c.kind === "xp") commit({ ...p, xp: p.xp + XP_CRATE, rank: rankInfo(p.xp + XP_CRATE).rank });
    },
    [commit]
  );

  const next = useMemo(() => run.levels.find((l) => l.index === level.index + 1) ?? null, [run, level.index]);
  const mapHref = `/run/${encodeURIComponent(run.id)}`;

  if (finished) {
    return (
      <div className="gx-wrap">
        <ResultView
          level={level}
          result={finished.result}
          proofs={finished.proofs}
          xpFrom={finished.xpFrom}
          xpTo={finished.xpTo}
          rankBefore={finished.rankBefore}
          rankAfter={finished.rankAfter}
          freezeEarned={finished.freezeEarned}
          crate={finished.crate}
          reduced={reduced}
          sound={settings.sound}
          nextHref={next ? `/play/${encodeURIComponent(next.id)}?run=${encodeURIComponent(run.id)}` : null}
          mapHref={mapHref}
          onRetry={onRetry}
          onCrateOpen={onCrate}
        />
      </div>
    );
  }

  return (
    <>
      <OfflineBanner />
      <PlayScreen
        v={{ ...v, actions: { ...v.actions, end: () => { v.actions.end(); router.push(mapHref); } } }}
        worldName={world?.name ?? `World ${level.world}`}
        reduced={reduced}
      />
    </>
  );
}
