"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import { ArrowRight } from "lucide-react";
import { Stage } from "@/components/game/Stage";
import { RunMap } from "@/components/game/RunMap";
import { StatusRail } from "@/components/game/StatusRail";
import { ErrorState, MapSkeleton, OfflineBanner } from "@/components/game/StateViews";
import { useRunData } from "@/components/game/useRunData";
import { currentLevel, isWon } from "@/components/game/map-model";
import { clockNow, ENDOWED_XP } from "@/components/game/engine-port";

export default function RunPage() {
  const { id } = useParams<{ id: string }>();
  const runId = decodeURIComponent(id);
  const data = useRunData(runId);
  const ctx = useMemo(() => clockNow(), []);

  if (data.status === "loading") {
    return (
      <Stage>
        <MapSkeleton />
      </Stage>
    );
  }
  if (data.status === "error") {
    return (
      <Stage>
        <div className="gx-wrap" style={{ paddingBlock: 32 }}>
          <ErrorState
            title="The run did not open"
            body={data.error.message}
            action={
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button type="button" className="gx-btn" onClick={data.reload}>Try again</button>
                <Link className="gx-btn gx-btn--ghost" href="/run/new">Build a new run</Link>
              </div>
            }
          />
        </div>
      </Stage>
    );
  }

  const { run, progress } = data;
  const cleared = run.levels.filter((l) => isWon(progress, l.id)).length;
  const cur = currentLevel(run, progress);
  const fresh = cleared === 0 && progress.xp === ENDOWED_XP;

  return (
    <Stage>
      {data.offline ? <OfflineBanner /> : null}
      <div className="gx-wrap gx-wide">
        <div className="gx-map-layout">
          <aside className="gx-map-rail" aria-label="Your run">
            <div style={{ display: "grid", gap: 14 }}>
              <div>
                <p className="gx-eyebrow">Your run</p>
                <h1 className="gx-h1" style={{ fontSize: "clamp(1.8rem, 1.2rem + 2.2vw, 2.6rem)" }}>{run.subjectTitle}</h1>
                <p className="gx-lede" style={{ marginTop: 8 }}>
                  <span className="gx-mono">{cleared}</span> of <span className="gx-mono">{run.size}</span> levels cleared
                </p>
                {fresh ? <p className="gx-note" style={{ marginTop: 6 }}>You start with a {ENDOWED_XP} XP head start. Level 1 is open.</p> : null}
              </div>
              <StatusRail progress={progress} ctx={ctx} />
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Link href="/proofs" className="gx-btn gx-btn--ghost gx-btn--sm">Proofs</Link>
                <Link href="/me" className="gx-btn gx-btn--ghost gx-btn--sm">Profile</Link>
                <Link href="/run/new" className="gx-btn gx-btn--ghost gx-btn--sm">Build another</Link>
              </div>
            </div>
          </aside>
          <section aria-label="Levels">
            <RunMap run={run} progress={progress} />
          </section>
        </div>
      </div>

      <div className="gx-continue">
        {cur ? (
          <Link className="gx-btn gx-btn--lg" href={`/play/${encodeURIComponent(cur.id)}?run=${encodeURIComponent(run.id)}`}>
            {cleared === 0 ? "Start level 1" : `Continue with level ${cur.index}`} <ArrowRight size={20} aria-hidden="true" />
          </Link>
        ) : (
          <Link className="gx-btn gx-btn--lg" href="/proofs">Run cleared. See your proofs <ArrowRight size={20} aria-hidden="true" /></Link>
        )}
      </div>
    </Stage>
  );
}
