"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Level, LevelResult, Progress, ProofCard, Run } from "@/lib/game/types";
import { PlayScreen } from "./PlayScreen";
import { ResultView } from "./ResultView";
import { useLevelSession } from "./useLevelSession";
import { applyResult, clockNow, finishLevel, grantCrateXp, grantFreeze, leaveResult, mergeProgress } from "./engine-port";
import { crateEligible, rollCrate, XP_CRATE, type Crate } from "./result-model";
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
  const settled = (v.play.phase === "won" || v.play.phase === "lost") && !v.reveal && !v.proofView && v.examinerDone !== false;

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
      won: crateEligible(before.results[level.id]?.stars ?? 0, result),
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

  const mapHref = `/run/${encodeURIComponent(run.id)}`;

  // Leaving mid-level keeps what was earned so far: proof cards and play time, as a quit result.
  const leave = useCallback(() => {
    v.actions.end();
    const ctx = clockNow();
    const left = applied.current ? null : leaveResult(v.play.run, ctx.now.toISOString());
    if (left) {
      applied.current = true;
      const a = applyResult(progressRef.current, run, left.result, left.proofs, ctx);
      commit(a.progress);
      void syncProgress(subjectIdOfRun(run.id), a.progress, left);
    }
    router.push(mapHref);
  }, [v.actions, v.play.run, run, commit, router, mapHref]);

  const onCrate = useCallback(
    (c: Crate) => {
      const p = progressRef.current;
      if (c.kind === "freeze") commit(grantFreeze(p));
      else if (c.kind === "xp") commit(grantCrateXp(p, XP_CRATE));
    },
    [commit]
  );

  const next = useMemo(() => run.levels.find((l) => l.index === level.index + 1) ?? null, [run, level.index]);

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
        v={{ ...v, actions: { ...v.actions, end: leave } }}
        worldName={world?.name ?? `World ${level.world}`}
        reduced={reduced}
      />
    </>
  );
}
