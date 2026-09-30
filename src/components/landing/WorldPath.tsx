"use client";
import { useRef } from "react";
import { useInView } from "@/components/ui/motion";

/**
 * Five levels and a boss, drawn as a path that fills in when it scrolls into
 * view: each node turns green a beat after the one before. Decorative: the
 * words beside it carry the meaning. Reduced motion shows the finished path.
 */
export function WorldPath() {
  const ref = useRef<HTMLDivElement>(null);
  const shown = useInView(ref);
  return (
    <div ref={ref} className="al-world" data-in={shown} aria-hidden="true">
      {[0, 1, 2, 3, 4].map((n) => (
        <span key={n} style={{ display: "contents", ["--n" as string]: n }}>
          <span className="al-node" />
          <span className="al-link" />
        </span>
      ))}
      <span className="al-node al-node--boss" style={{ ["--n" as string]: 5 }} />
    </div>
  );
}
