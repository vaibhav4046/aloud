"use client";
import { useEffect, useRef, useState } from "react";
import { useInView, usePrefersReducedMotion } from "./hooks";

/** Ease-out cubic: fast start, long settle. Exported for the unit test. */
export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

/**
 * A number that counts up to `to` once it scrolls into view. Tabular numerals,
 * so the width does not jitter while it runs. The first render already prints
 * the final value for screen readers (aria-label) and for reduced motion; the
 * visible digits animate from `from`.
 */
export function CountUp({
  to,
  from = 0,
  decimals = 0,
  duration = 900,
  prefix = "",
  suffix = "",
  className = "",
  trigger,
}: {
  to: number;
  from?: number;
  decimals?: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
  /** Start when this flips true instead of when the element scrolls into view (a level result, say). */
  trigger?: boolean;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const seen = useInView(ref);
  const reduced = usePrefersReducedMotion();
  const go = trigger ?? seen;
  const [value, setValue] = useState(to);
  const shown = useRef(false);

  useEffect(() => {
    if (!go || shown.current) return;
    shown.current = true;
    if (reduced) {
      setValue(to);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = (now - t0) / duration;
      setValue(from + (to - from) * easeOutCubic(p));
      if (p < 1) raf = requestAnimationFrame(tick);
      else setValue(to);
    };
    setValue(from);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [go, reduced, to, from, duration]);

  const fmt = (n: number) => n.toLocaleString("en-GB", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return (
    <span ref={ref} className={`tnum ${className}`.trim()} aria-label={`${prefix}${fmt(to)}${suffix}`}>
      <span aria-hidden="true">
        {prefix}
        {fmt(value)}
        {suffix}
      </span>
    </span>
  );
}
