"use client";
import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { useInView, usePrefersReducedMotion } from "./hooks";

/**
 * A layer that moves at a different speed from the page as it scrolls.
 *
 * `speed` is the fraction of the element's distance from the viewport centre
 * that it drifts: 0.1 drifts a little slower than the page, -0.1 a little
 * faster. Only `transform` is written, from one rAF per scroll frame, and only
 * while the element is on screen. Reduced motion: no listener, no movement.
 */
export function Parallax({
  speed = 0.1,
  max = 80,
  className = "",
  style,
  children,
}: {
  speed?: number;
  max?: number;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const visible = useInView(ref, { once: false, rootMargin: "20% 0px 20% 0px", threshold: 0 });
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el || !visible || reduced) return;
    let raf = 0;
    const paint = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const offset = r.top + r.height / 2 - window.innerHeight / 2;
      const shift = Math.max(-max, Math.min(max, offset * speed));
      el.style.transform = `translate3d(0, ${shift.toFixed(1)}px, 0)`;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(paint);
    };
    paint();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [visible, reduced, speed, max]);

  return (
    <div ref={ref} className={className} style={{ willChange: visible && !reduced ? "transform" : undefined, ...style }}>
      {children}
    </div>
  );
}
