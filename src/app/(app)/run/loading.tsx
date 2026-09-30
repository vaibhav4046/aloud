import { Stage } from "@/components/game/Stage";
import { MapSkeleton } from "@/components/game/StateViews";

export default function RunLoading() {
  return (
    <Stage>
      <MapSkeleton />
    </Stage>
  );
}
