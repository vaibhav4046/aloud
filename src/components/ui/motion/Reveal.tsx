"use client";
import { useRef, type CSSProperties, type ElementType, type ReactNode } from "react";
import { useInView } from "./hooks";

/**
 * Fade and rise into place when scrolled into view.
 *
 * Plain CSS does the moving (see .reveal in primitives.css: opacity and
 * transform only, 700 ms, expo ease-out); this component only decides when.
 * Under prefers-reduced-motion, and where scripting is off, the CSS shows the
 * final state immediately, so nothing is ever left hidden.
 *
 * `delay` is milliseconds. A row of siblings staggers by giving each
 * `delay={i * 70}`.
 */
export function Reveal({
  as,
  delay = 0,
  y = 24,
  className = "",
  style,
  children,
}: {
  as?: ElementType;
  delay?: number;
  y?: number;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const Tag = (as ?? "div") as ElementType;
  const ref = useRef<HTMLElement>(null);
  const shown = useInView(ref);
  return (
    <Tag
      ref={ref}
      className={`reveal ${className}`.trim()}
      data-in={shown ? "true" : "false"}
      style={{ "--reveal-y": `${y}px`, "--reveal-delay": `${delay}ms`, ...style } as CSSProperties}
    >
      {children}
    </Tag>
  );
}
