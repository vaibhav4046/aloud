import { Stage } from "@/components/game/Stage";
import { PlaySkeleton } from "@/components/game/StateViews";

export default function PlayLoading() {
  return (
    <Stage>
      <PlaySkeleton />
    </Stage>
  );
}
