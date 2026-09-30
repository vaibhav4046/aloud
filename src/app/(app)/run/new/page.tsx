import { Suspense } from "react";
import { Stage } from "@/components/game/Stage";
import { BuildScreen } from "@/components/game/BuildScreen";
import { MapSkeleton } from "@/components/game/StateViews";

export const metadata = { title: "Build a run" };

export default function NewRunPage() {
  return (
    <Stage>
      <div>
        <Suspense fallback={<MapSkeleton />}>
          <BuildScreen />
        </Suspense>
      </div>
    </Stage>
  );
}
