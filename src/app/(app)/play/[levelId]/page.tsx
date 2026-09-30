"use client";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Stage } from "@/components/game/Stage";
import { LevelPlay } from "@/components/game/LevelPlay";
import { ErrorState, PlaySkeleton } from "@/components/game/StateViews";
import { lastRunId, useRunData } from "@/components/game/useRunData";

/**
 * /play/[levelId]?run=<runId>. The run id rides in the URL so a shared or
 * bookmarked level opens on the right run; without it the last run this browser
 * played is used.
 */
export default function PlayPage() {
  const { levelId } = useParams<{ levelId: string }>();
  const search = useSearchParams();
  const fromUrl = search.get("run");
  const [runId, setRunId] = useState<string | null>(fromUrl);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!fromUrl) setRunId(lastRunId());
  }, [fromUrl]);
  const data = useRunData(runId ?? "");
  const id = decodeURIComponent(levelId);

  if (runId === null && !fromUrl) {
    return (
      <Stage>
        <div className="gx-wrap" style={{ paddingBlock: 32 }}>
          <ErrorState title="No run to play" body="Open a run first, then pick a level from its map." action={<Link className="gx-btn" href="/run/new">Build a run</Link>} />
        </div>
      </Stage>
    );
  }
  if (data.status === "loading") {
    return (
      <Stage>
        <PlaySkeleton />
      </Stage>
    );
  }
  if (data.status === "error") {
    return (
      <Stage>
        <div className="gx-wrap" style={{ paddingBlock: 32 }}>
          <ErrorState title="The level did not open" body={data.error.message} action={<button type="button" className="gx-btn" onClick={data.reload}>Try again</button>} />
        </div>
      </Stage>
    );
  }

  const level = data.run.levels.find((l) => l.id === id) ?? null;
  if (!level) {
    return (
      <Stage>
        <div className="gx-wrap" style={{ paddingBlock: 32 }}>
          <ErrorState title="That level is not in this run" body="The run may have been rebuilt from new material. Open the map to see its levels." action={<Link className="gx-btn" href={`/run/${encodeURIComponent(data.run.id)}`}>Back to the map</Link>} />
        </div>
      </Stage>
    );
  }
  if (level.index > data.progress.unlockedIndex) {
    return (
      <Stage>
        <div className="gx-wrap" style={{ paddingBlock: 32 }}>
          <ErrorState title="This level is locked" body={`Win level ${level.index - 1} to open level ${level.index}.`} action={<Link className="gx-btn" href={`/run/${encodeURIComponent(data.run.id)}`}>Back to the map</Link>} />
        </div>
      </Stage>
    );
  }

  return (
    <Stage>
      <LevelPlay key={`${level.id}:${attempt}`} run={data.run} level={level} progress={data.progress} commit={data.commit} onRetry={() => setAttempt((n) => n + 1)} />
    </Stage>
  );
}
