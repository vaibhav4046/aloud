import Link from "next/link";
import { MarkIcon } from "@/components/ui/icons";

/**
 * The Aloud wordmark: the mark plus the name set in the display face, lower
 * case, with a little air between the letters at small sizes. Used in the
 * headers and the footer. `href` makes it a link home.
 */
export function Wordmark({ size = 26, href }: { size?: number; href?: string }) {
  const body = (
    <>
      <MarkIcon size={size} />
      <span className="heading" style={{ fontSize: size * 0.95, lineHeight: 1, letterSpacing: "-0.02em" }}>
        aloud
      </span>
    </>
  );
  const style = { display: "inline-flex", alignItems: "center", gap: size * 0.32 } as const;
  if (href) {
    return (
      <Link href={href} aria-label="Aloud home" className="min-h-11" style={style}>
        {body}
      </Link>
    );
  }
  return <span style={style}>{body}</span>;
}
