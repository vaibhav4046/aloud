import { ShieldCheck } from "lucide-react";
import type { ProofCard } from "@/lib/game/types";

/** One collected proof: the verbatim quote, its page in mono, and what checked it. */
export function ProofCardView({ card, compact = false, conceptName }: { card: ProofCard; compact?: boolean; conceptName?: string }) {
  return (
    <article className="gx-pcard gx-card" style={compact ? { padding: 16, textAlign: "left" } : undefined}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <span className="gx-eyebrow">{conceptName ?? "Proof card"}</span>
        <span className="gx-proof-page">{card.page != null ? `p. ${card.page}` : "notes"}</span>
      </div>
      <blockquote>{card.quote}</blockquote>
      <footer>
        <span style={{ display: "inline-flex", gap: 6, alignItems: "center", color: "var(--g-ok)", fontWeight: 600 }}>
          <ShieldCheck size={14} aria-hidden="true" /> Checked by code against your page
        </span>
        {compact ? null : <time dateTime={card.earnedAt}>{new Date(card.earnedAt).toLocaleDateString()}</time>}
      </footer>
    </article>
  );
}
