"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ShieldCheck } from "lucide-react";
import type { ProofCard, Run } from "@/lib/game/types";
import { Stage } from "@/components/game/Stage";
import { ProofCardView } from "@/components/game/ProofCardView";
import { readLocalGame } from "@/components/game/game-client";

type Loaded = { proofs: ProofCard[]; levelTitles: Record<string, string> } | null;

function collect(): Loaded {
  const { runs, progress } = readLocalGame();
  const seen = new Set<string>();
  const proofs: ProofCard[] = [];
  for (const p of progress) for (const c of p.proofs) if (!seen.has(c.id)) (seen.add(c.id), proofs.push(c));
  proofs.sort((a, b) => (a.earnedAt < b.earnedAt ? 1 : -1));
  const levelTitles: Record<string, string> = {};
  runs.forEach((r: Run) => r.levels.forEach((l) => (levelTitles[l.id] = l.title)));
  return { proofs, levelTitles };
}

export default function ProofsPage() {
  const [data, setData] = useState<Loaded>(null);
  useEffect(() => setData(collect()), []);
  const pages = useMemo(() => new Set(data?.proofs.map((p) => p.page).filter((p) => p != null)).size, [data]);

  return (
    <Stage>
      <div className="gx-wrap gx-wide" style={{ display: "grid", gap: 22, paddingBlock: "28px 120px" }}>
        <div style={{ display: "grid", gap: 10 }}>
          <p className="gx-eyebrow">Proofs</p>
          <h1 className="gx-h1">Quotes your pages back up</h1>
          <p className="gx-lede">
            Each card is a line from your own notes that code found on the page, word for word, while you were talking. A model does not write these.
          </p>
          {data && data.proofs.length ? (
            <p className="gx-note gx-mono">{data.proofs.length} card{data.proofs.length === 1 ? "" : "s"} from {pages} page{pages === 1 ? "" : "s"}</p>
          ) : null}
        </div>

        {!data ? (
          <div className="gx-grid" role="status" aria-busy="true" aria-label="Loading your proofs">
            {[0, 1, 2].map((i) => <div key={i} className="gx-skel" style={{ height: 190 }} />)}
          </div>
        ) : data.proofs.length === 0 ? (
          <div className="gx-state gx-card">
            <span className="gx-empty-art" aria-hidden="true"><ShieldCheck size={40} strokeWidth={1.6} /></span>
            <h2 className="gx-h2">No proof cards yet</h2>
            <p className="gx-lede">Answer a question with something your pages say, and the card lands here with its page number.</p>
            <Link className="gx-btn" href="/run">Play a level</Link>
          </div>
        ) : (
          <div className="gx-grid">
            {data.proofs.map((c) => (
              <ProofCardView key={c.id} card={c} conceptName={data.levelTitles[c.levelId]} />
            ))}
          </div>
        )}
      </div>
    </Stage>
  );
}
