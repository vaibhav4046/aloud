"use client";
import { useEffect, useRef, useState } from "react";
import { BookOpen, Check, Heart, Minus, ShieldCheck, X } from "lucide-react";
import type { RoundOutcome } from "@/lib/game/types";
import { highlightParts } from "./highlight";
import { comboView, OUTCOME_COPY, type Feedback } from "./play-model";
import { KIND_LABEL } from "./map-model";
import type { LevelKind } from "@/lib/game/types";

export function Hearts({ hearts, max, hitSeq }: { hearts: number; max: number; hitSeq: number }) {
  return (
    <div className="gx-hearts" role="img" aria-label={`${hearts} of ${max} hearts`}>
      {Array.from({ length: max }, (_, i) => {
        const lost = i >= hearts;
        // The heart that was just lost shakes once; hitSeq restarts the animation.
        const hit = lost && i === hearts && hitSeq > 0;
        return <Heart key={`${i}-${hit ? hitSeq : 0}`} className={`gx-heart${lost ? " lost" : ""}${hit ? " hit" : ""}`} fill={lost ? "none" : "currentColor"} strokeWidth={2} />;
      })}
    </div>
  );
}

export function RoundPips({ total, outcomes, hasNow }: { total: number; outcomes: RoundOutcome[]; hasNow: boolean }) {
  return (
    <div className="gx-rounds" role="img" aria-label={`Round ${Math.min(total, outcomes.length + 1)} of ${total}`}>
      {Array.from({ length: total }, (_, i) => {
        const o = outcomes[i];
        const cls = o ? (o === "incorrect" || o === "bluff_missed" ? "miss" : "done") : i === outcomes.length && hasNow ? "now" : "";
        return <i key={i} className={cls} />;
      })}
    </div>
  );
}

export function ComboMeter({ streak }: { streak: number }) {
  const v = comboView(streak);
  return (
    <div className={`gx-combo${v.multiplier > 1 ? " hot" : ""}`} aria-label={`Combo ${streak}, multiplier ${v.multiplier}`} role="group">
      <b>x{v.multiplier.toFixed(1)}</b>
      <span className="gx-combo-bar" aria-hidden="true"><i style={{ transform: `scaleX(${v.fill})` }} /></span>
      <span className="gx-note" aria-hidden="true">{v.nextAt ? `${v.nextAt - streak} to x${nextMult(v.nextAt)}` : "Top combo"}</span>
    </div>
  );
}

const nextMult = (at: number): string => (at === 3 ? "1.2" : at === 5 ? "1.5" : "2");

export function PromptCard({
  kind,
  round,
  total,
  text,
  hint,
  hintShown,
  onHint,
  onPeek,
  children,
}: {
  kind: LevelKind;
  round: number;
  total: number;
  text: string;
  hint: string | null;
  hintShown: boolean;
  onHint: () => void;
  onPeek: () => void;
  children?: React.ReactNode;
}) {
  return (
    <section className="gx-prompt gx-card" aria-labelledby="gx-q">
      <div className="gx-prompt-kind">
        <span className="gx-chip">{KIND_LABEL[kind]}</span>
        <span className="gx-eyebrow">Round {Math.min(round, total)} of {total}</span>
      </div>
      <h1 id="gx-q" className="gx-prompt-text">{text}</h1>
      {hintShown && hint ? <p className="gx-note" role="note">Hint: {hint}</p> : null}
      {children}
      <div className="gx-prompt-actions">
        <button type="button" className="gx-btn gx-btn--ghost gx-btn--sm" onClick={onPeek}>
          <BookOpen size={16} aria-hidden="true" /> Peek at the page
        </button>
        {hint && !hintShown ? (
          <button type="button" className="gx-btn gx-btn--ghost gx-btn--sm" onClick={onHint}>Hint</button>
        ) : null}
      </div>
      <p className="gx-note">A hint or a peek keeps your heart and takes half of this round&apos;s XP.</p>
    </section>
  );
}

/** Spot the Bluff: the claim the examiner just made, and the two ways to answer it. */
export function ClaimCard({
  claim,
  round,
  total,
  onChoose,
  choice,
  disabled,
}: {
  claim: string;
  round: number;
  total: number;
  onChoose: (c: "bluff" | "real") => void;
  choice: "bluff" | "real" | null;
  disabled: boolean;
}) {
  return (
    <section className="gx-claim" aria-labelledby="gx-claim-h">
      <h1 id="gx-claim-h" className="gx-sr">Catch it, claim {Math.min(round, total)} of {total}</h1>
      <div className="gx-prompt-kind">
        <span className="gx-chip">Catch it</span>
        <span className="gx-eyebrow">Claim {Math.min(round, total)} of {total}</span>
      </div>
      <p className="gx-eyebrow">The examiner says</p>
      <q>{claim}</q>
      <div className="gx-claim-choices" role="group" aria-label="Is the claim true">
        <button type="button" className="gx-btn gx-btn--peach" aria-pressed={choice === "bluff"} disabled={disabled} onClick={() => onChoose("bluff")}>
          Catch it
        </button>
        <button type="button" className="gx-btn gx-btn--mint" aria-pressed={choice === "real"} disabled={disabled} onClick={() => onChoose("real")}>
          That is true
        </button>
      </div>
      <p className="gx-note">
        Say it out loud, or tap. If you catch it, give the correction. Half of the claims in a level are real.
      </p>
    </section>
  );
}

export function Captions({ examiner, cut, you, examinerLabel = "Examiner" }: { examiner: string; cut: boolean; you: string; examinerLabel?: string }) {
  return (
    <div className="gx-caps gx-card" aria-label="Live captions">
      {examiner ? (
        <p className={cut ? "cut" : undefined}><span className="gx-eyebrow">{examinerLabel}</span> {examiner}</p>
      ) : (
        <p className="you">The examiner&apos;s words appear here as they speak.</p>
      )}
      {you ? <p className="you"><span className="gx-eyebrow">You</span> {you}</p> : null}
    </div>
  );
}

/** Instant feedback: appears in the same frame the round resolves. Announcement lives in a separate live region. */
export function FeedbackToast({ fb }: { fb: Feedback }) {
  const copy = OUTCOME_COPY[fb.outcome];
  const Icon = copy.tone === "good" ? Check : copy.tone === "bad" ? X : Minus;
  return (
    <div key={fb.seq} className="gx-fb" data-tone={copy.tone} aria-hidden="true">
      <span className="dot"><Icon size={16} strokeWidth={3} /></span>
      <span>{copy.title}</span>
      {fb.xpGain > 0 ? <span className="xp">+{fb.xpGain} XP</span> : null}
      {fb.multiplier > 1 && fb.xpGain > 0 ? <span className="gx-mono">x{fb.multiplier.toFixed(1)}</span> : null}
    </div>
  );
}

export type ProofView = { quote: string; page: number | null; spans?: string[] };

/** A verified quote landing: page number in mono, the matched span highlighted, and what checked it. */
export function ProofReveal({ proof, onClose }: { proof: ProofView; onClose: () => void }) {
  const parts = highlightParts(proof.quote, proof.spans ?? []);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const id = setTimeout(onClose, 9000);
    return () => clearTimeout(id);
  }, [onClose]);
  return (
    <div className="gx-proof-sheet">
      <aside className="gx-proof" aria-label="Proof card">
        <div className="gx-proof-head">
          <span className="gx-eyebrow">Proof card</span>
          <span className="gx-proof-page">{proof.page != null ? `p. ${proof.page}` : "your notes"}</span>
        </div>
        <blockquote>
          {parts.map((p, i) => (p.hit ? <mark key={i}>{p.text}</mark> : <span key={i}>{p.text}</span>))}
        </blockquote>
        <div className="gx-proof-foot"><ShieldCheck size={16} aria-hidden="true" /> Checked by code against your page</div>
        <button ref={closeRef} type="button" className="gx-btn gx-btn--ghost gx-btn--sm" onClick={onClose}>Keep going</button>
      </aside>
    </div>
  );
}

type Chunk = { id: string; text: string; locator: { page?: number; section?: string } };

/** The source peek: the player's own pages, on demand, with the passage the round is about lit. */
export function PeekDrawer({ subjectId, focusPassageId, onClose }: { subjectId: string; focusPassageId: string | null; onClose: () => void }) {
  const [chunks, setChunks] = useState<Chunk[] | null>(null);
  const [error, setError] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let live = true;
    void fetch(`/api/sources?subject=${encodeURIComponent(subjectId)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("sources"))))
      .then((b: { chunks?: Chunk[] }) => live && setChunks(b.chunks ?? []))
      .catch(() => live && setError(true));
    return () => {
      live = false;
    };
  }, [subjectId]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (chunks && focusPassageId) document.getElementById(`gx-pg-${focusPassageId}`)?.scrollIntoView({ block: "center" });
  }, [chunks, focusPassageId]);

  return (
    <>
      <div className="gx-drawer-scrim" onClick={onClose} aria-hidden="true" />
      <div className="gx-drawer" role="dialog" aria-modal="true" aria-label="Your pages">
        <header>
          <h2 className="gx-h2">Your pages</h2>
          <button ref={closeRef} type="button" className="gx-iconbtn" onClick={onClose} aria-label="Close your pages"><X size={20} aria-hidden="true" /></button>
        </header>
        <div className="gx-drawer-body">
          {error ? <p className="gx-note" role="alert">The pages could not be loaded. Check your connection and try again.</p> : null}
          {!chunks && !error ? <div className="gx-skel" style={{ height: 96 }} aria-busy="true" /> : null}
          {chunks?.length === 0 ? <p className="gx-note">There are no pages to show for this subject.</p> : null}
          {chunks?.map((c) => (
            <article key={c.id} id={`gx-pg-${c.id}`} className={`gx-passage${c.id === focusPassageId ? " hi" : ""}`}>
              <span className="gx-mono">{c.locator.page != null ? `Page ${c.locator.page}` : c.locator.section ?? "Notes"}</span>
              {c.text}
            </article>
          ))}
        </div>
      </div>
    </>
  );
}
