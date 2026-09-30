"use client";
import { useRef, type ReactNode } from "react";
import { usePrefersReducedMotion } from "./hooks";

/**
 * Wraps a control so it leans a few pixels toward the pointer. Mouse pointers
 * only (a finger has no hover), reduced motion off, and the pull is capped, so
 * the click target never moves far enough to be missed. Wrap a button or a
 * link; the wrapper is display: inline-block.
 */
export function Magnetic({ children, strength = 0.28, max = 10 }: { children: ReactNode; strength?: number; max?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduced = usePrefersReducedMotion();

  const move = (e: React.PointerEvent<HTMLSpanElement>) => {
    const el = ref.current;
    if (!el || reduced || e.pointerType !== "mouse") return;
    const r = el.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    const cl = (n: number) => Math.max(-max, Math.min(max, n * strength));
    el.style.transform = `translate3d(${cl(dx).toFixed(1)}px, ${cl(dy).toFixed(1)}px, 0)`;
  };
  const leave = () => {
    if (ref.current) ref.current.style.transform = "";
  };

  return (
    <span ref={ref} className="magnetic" onPointerMove={move} onPointerLeave={leave} onPointerCancel={leave}>
      {children}
    </span>
  );
}
