"use client";
import { useEffect, useRef, useState, type RefObject } from "react";

/**
 * True when the visitor asked the OS for less motion. Starts false on the
 * server and on first paint, then reads the media query, so markup hydrates
 * identically. Subscribes, so flipping the OS setting takes effect live.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const q = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(q.matches);
    sync();
    q.addEventListener("change", sync);
    return () => q.removeEventListener("change", sync);
  }, []);
  return reduced;
}

/**
 * True once the element has entered the viewport. `once` (default) latches it,
 * which is what reveal and count-up want; pass false to follow visibility, which
 * is what a canvas loop wants so it can pause off-screen.
 */
export function useInView<T extends Element>(
  ref: RefObject<T | null>,
  opts: { once?: boolean; rootMargin?: string; threshold?: number } = {},
): boolean {
  const { once = true, rootMargin = "0px 0px -8% 0px", threshold = 0.05 } = opts;
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setInView(true);
            if (once) io.disconnect();
          } else if (!once) {
            setInView(false);
          }
        }
      },
      { rootMargin, threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, once, rootMargin, threshold]);
  return inView;
}

/** Latest value in a ref, for rAF loops that must not restart when a prop changes. */
export function useLatest<T>(value: T): RefObject<T> {
  const r = useRef(value);
  useEffect(() => {
    r.current = value;
  });
  return r;
}
