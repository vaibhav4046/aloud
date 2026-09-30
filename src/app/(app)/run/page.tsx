"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { lastRunId } from "@/components/game/useRunData";
import { Stage } from "@/components/game/Stage";
import { MapSkeleton } from "@/components/game/StateViews";

/** /run opens the last run this browser played, or the build screen when there is none. */
export default function RunIndex() {
  const router = useRouter();
  useEffect(() => {
    const id = lastRunId();
    router.replace(id ? `/run/${encodeURIComponent(id)}` : "/run/new");
  }, [router]);
  return (
    <Stage>
      <MapSkeleton />
    </Stage>
  );
}
