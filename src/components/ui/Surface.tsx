import type { CSSProperties, ElementType, ReactNode } from "react";

type Tone = "paper" | "panel" | "accent";

/**
 * A large rounded surface. `paper` is the white card on the warm canvas,
 * `panel` is the deep green-black block used once or twice per page, `accent`
 * is the lavender highlight. `size="xl"` gives the 40 px hero-panel radius,
 * `size="tile"` the 20 px inner tile. Server-safe.
 */
export function Surface({
  tone = "paper",
  size = "card",
  as,
  className = "",
  style,
  children,
  ...rest
}: {
  tone?: Tone;
  size?: "card" | "xl" | "tile";
  as?: ElementType;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
} & Omit<React.HTMLAttributes<HTMLElement>, "className" | "style" | "children">) {
  const Tag = (as ?? "div") as ElementType;
  const cls = ["surface", tone !== "paper" ? `surface--${tone}` : "", size !== "card" ? `surface--${size}` : "", className]
    .filter(Boolean)
    .join(" ");
  return (
    <Tag className={cls} style={style} {...rest}>
      {children}
    </Tag>
  );
}
