import type { CSSProperties } from "react";

/*
 * Small illustrated game parts, drawn as SVG on tokens. They are server-safe
 * and stateless: pass the numbers in. The landing page shows them by function
 * (what a heart does, what the ring counts) and the game screens reuse them.
 * Colour is never the only signal: a lost heart is dimmed AND smaller, a
 * filled star is solid and an empty one is an outline.
 */

const HEART_PATH = "M12 20.6s-7.6-4.6-7.6-10.4A4.2 4.2 0 0 1 12 7.7a4.2 4.2 0 0 1 7.6 2.5c0 5.8-7.6 10.4-7.6 10.4Z";
const STAR_PATH = "m12 3.6 2.6 5.5 6 .8-4.4 4.1 1.1 5.9L12 17l-5.3 2.9 1.1-5.9-4.4-4.1 6-.8L12 3.6Z";

/** Hearts left out of a maximum. Lost hearts dim and shrink. */
export function Hearts({ left, max = 3, size = 26 }: { left: number; max?: number; size?: number }) {
  return (
    <span role="img" aria-label={`${left} of ${max} hearts left`} style={{ display: "inline-flex", gap: 4 }}>
      {Array.from({ length: max }, (_, i) => (
        <svg key={i} className="heart" data-lost={i >= left} width={size} height={size} viewBox="0 0 24 24" aria-hidden focusable="false">
          <path d={HEART_PATH} fill="var(--correction)" stroke="var(--correction)" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
      ))}
    </span>
  );
}

/** Stars earned out of three. */
export function Stars({ earned, max = 3, size = 30, animate = false }: { earned: number; max?: number; size?: number; animate?: boolean }) {
  return (
    <span role="img" aria-label={`${earned} of ${max} stars`} style={{ display: "inline-flex", gap: 4 }}>
      {Array.from({ length: max }, (_, i) => {
        const on = i < earned;
        return (
          <svg
            key={i}
            className="star"
            data-on={animate && on}
            style={{ "--star-delay": `${i * 140}ms` } as CSSProperties}
            width={size}
            height={size}
            viewBox="0 0 24 24"
            aria-hidden
            focusable="false"
          >
            <path
              d={STAR_PATH}
              fill={on ? "var(--warning)" : "none"}
              stroke="var(--warning)"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
          </svg>
        );
      })}
    </span>
  );
}

/** The streak flame with its day count. A freeze shows as a small ice tag, never as guilt. */
export function StreakFlame({ days, frozen = false, size = 40 }: { days: number; frozen?: boolean; size?: number }) {
  return (
    <span role="img" aria-label={`${days} day streak${frozen ? ", one freeze saved" : ""}`} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <svg className="flame-flicker" width={size} height={size} viewBox="0 0 24 24" aria-hidden focusable="false">
        <path d="M12 2.8c.6 3.3-2.5 4.9-3.9 7.5-1.2 2.3-.4 4.2.9 5.2-.1-1.4.5-2.5 1.6-3.2.1 2 2 2.3 2.3 4.3.3 2-.6 3.5-1.4 4.3 3-.3 6-2.4 5.6-6.3-.3-3.2-2.7-4.2-2.9-6.2-.1-1.6.6-3.1-2.2-5.6Z" fill="var(--warning)" />
        <path d="M12.3 13.6c.9 1.1 2.1 1.8 1.7 3.4-.3 1.2-1.3 1.9-2.2 2-1.4-.4-2.1-1.6-1.7-2.9.3-1 1.3-1.4 2.2-2.5Z" fill="var(--warning-tint)" />
      </svg>
      <span className="tnum heading" style={{ fontSize: size * 0.7 }}>
        {days}
      </span>
      {frozen && (
        <span className="pill" style={{ padding: "2px 10px" }}>
          freeze saved
        </span>
      )}
    </span>
  );
}

/** A ring that fills toward a daily goal. `value` and `goal` in the same unit (minutes). */
export function ProgressRing({
  value,
  goal,
  size = 120,
  stroke = 12,
  label,
}: {
  value: number;
  goal: number;
  size?: number;
  stroke?: number;
  label?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const frac = goal > 0 ? Math.min(1, Math.max(0, value / goal)) : 0;
  return (
    <span
      role="img"
      aria-label={label ?? `${value} of ${goal} minutes today`}
      style={{ display: "inline-grid", placeItems: "center", width: size, height: size, position: "relative" }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden focusable="false" style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
        <circle
          className="ring-arc"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--success)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - frac)}
        />
      </svg>
      <span className="tnum heading" style={{ position: "absolute", fontSize: size * 0.26, textAlign: "center", lineHeight: 1 }}>
        {value}
        <span style={{ display: "block", fontFamily: "var(--font-ui)", fontSize: size * 0.11, color: "var(--text-muted)", marginTop: 2 }}>
          of {goal} min
        </span>
      </span>
    </span>
  );
}
