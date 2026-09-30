"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Gift, Snowflake, Sparkles, Star, Trophy, Zap } from "lucide-react";
import type { Level, LevelResult, ProofCard } from "@/lib/game/types";
import { burstParticles, countUp, crateCopy, starsCopy, type Crate } from "./result-model";
import { ProofCardView } from "./ProofCardView";
import { playCue } from "./sound";

const COUNT_MS = 1100;

/** XP counts up from `from` to `to`. With reduced motion it shows the final number at once. */
export function useCountUp(from: number, to: number, reduced: boolean): number {
  const [v, setV] = useState(reduced ? to : from);
  useEffect(() => {
    if (reduced || from === to) {
      setV(to);
      return;
    }
    let raf = 0;
    const start = performance.now() + 500;
    const tick = (now: number) => {
      const t = Math.max(0, (now - start) / COUNT_MS);
      setV(countUp(from, to, t));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [from, to, reduced]);
  return v;
}

function CrateBox({ crate, sound, onOpen }: { crate: Crate; sound: boolean; onOpen: (c: Crate) => void }) {
  const [open, setOpen] = useState(false);
  const copy = crateCopy(crate);
  const reveal = () => {
    if (open) return;
    setOpen(true);
    playCue("crate", sound);
    onOpen(crate);
  };
  const Icon = crate.kind === "freeze" ? Snowflake : crate.kind === "xp" ? Zap : Sparkles;
  return (
    <section className="gx-crate" aria-label="Crate">
      <button type="button" className="gx-crate-box" data-open={open} onClick={reveal} aria-label={open ? copy.title : "Open the crate"}>
        {open ? <Icon size={40} aria-hidden="true" /> : <Gift size={40} aria-hidden="true" />}
      </button>
      {open ? (
        <div role="status" style={{ display: "grid", gap: 6 }}>
          <b className="gx-h2" style={{ fontSize: "1.2rem" }}>{copy.title}</b>
          {crate.kind === "fact" ? <blockquote style={{ margin: 0, fontFamily: "var(--g-display)", fontSize: "1.05rem", lineHeight: 1.45 }}>{crate.quote}</blockquote> : null}
          <span className="gx-note">{copy.body}</span>
        </div>
      ) : (
        <span className="gx-note">A crate dropped. Open it to see what is inside.</span>
      )}
    </section>
  );
}

export type ResultProps = {
  level: Level;
  result: LevelResult;
  proofs: ProofCard[];
  xpFrom: number;
  xpTo: number;
  rankBefore: number;
  rankAfter: number;
  freezeEarned: boolean;
  crate: Crate | null;
  reduced: boolean;
  sound: boolean;
  nextHref: string | null;
  mapHref: string;
  onRetry: () => void;
  onCrateOpen: (c: Crate) => void;
};

export function ResultView(p: ResultProps) {
  const won = p.result.outcome === "won";
  const shown = useCountUp(p.xpFrom, p.xpTo, p.reduced);
  const gained = p.xpTo - p.xpFrom;
  const particles = useRef(burstParticles(p.result.stars)).current;
  const rankUp = p.rankAfter > p.rankBefore;

  useEffect(() => {
    // The result opens at the top, not wherever the last round left the page.
    window.scrollTo(0, 0);
    if (won) playCue("star", p.sound);
    // once per mount: the sound is a reaction to arriving on this screen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="gx-result" data-testid="result">
      <p className="gx-eyebrow">{won ? "Level cleared" : "Level not cleared"} · {p.level.title}</p>

      {won ? (
        <div className="gx-stars-big" role="img" aria-label={`${p.result.stars} of 3 stars`}>
          {[0, 1, 2].map((i) => (
            <Star key={i} className={i < p.result.stars ? "on" : ""} style={{ ["--i" as string]: i }} strokeWidth={1.5} />
          ))}
          <span className="gx-burst" aria-hidden="true">
            {particles.map((q, i) => (
              <i
                key={i}
                style={{
                  width: q.size,
                  height: q.size,
                  ["--dx" as string]: `${Math.cos(q.angle) * q.distance * 2.2}px`,
                  ["--dy" as string]: `${Math.sin(q.angle) * q.distance * 1.6}px`,
                  ["--d" as string]: `${0.2 + q.delay}s`,
                }}
              />
            ))}
          </span>
        </div>
      ) : null}

      <h1 className="gx-h1">{starsCopy(p.result.stars, won)}</h1>

      <div>
        <div className="gx-xp-big" aria-label={`${gained} XP earned`}>+{won ? shown - p.xpFrom : 0}<span style={{ fontSize: "0.4em", marginLeft: 8 }}>XP</span></div>
        <p className="gx-note">
          {won ? `${p.result.heartsLeft} of ${p.level.hearts} hearts left. Best combo ${p.result.bestCombo}.` : "Nothing was lost. Proof cards you earned are kept."}
        </p>
      </div>

      {rankUp ? (
        <div className="gx-rankup" role="status">
          <Trophy size={28} aria-hidden="true" />
          <span>Rank up</span>
          <b>{p.rankBefore} to {p.rankAfter}</b>
        </div>
      ) : null}

      {p.freezeEarned ? (
        <div className="gx-tile gx-card" role="status" style={{ width: "100%" }}>
          <b><Snowflake size={16} aria-hidden="true" style={{ verticalAlign: "-2px" }} /> Streak freeze earned</b>
          <span className="gx-note">Seven days in a row. It is spent by itself the first day you miss.</span>
        </div>
      ) : null}

      {p.proofs.length ? (
        <section className="gx-result-grid" aria-label="Proof cards earned">
          <h2 className="gx-h2" style={{ textAlign: "left" }}>Proof cards earned</h2>
          <div className="gx-proofs-row">
            {p.proofs.map((c) => <ProofCardView key={c.id} card={c} compact />)}
          </div>
        </section>
      ) : null}

      {p.crate ? <CrateBox crate={p.crate} sound={p.sound} onOpen={p.onCrateOpen} /> : null}

      <div className="gx-result-cta">
        {won && p.nextHref ? <Link href={p.nextHref} className="gx-btn gx-btn--lg">Next level</Link> : null}
        {!won ? <button type="button" className="gx-btn gx-btn--lg" onClick={p.onRetry}>Retry, it is free</button> : null}
        {won && p.result.stars < 3 ? <button type="button" className="gx-btn gx-btn--ghost" onClick={p.onRetry}>Replay for more stars</button> : null}
        <Link href={p.mapHref} className="gx-btn gx-btn--ghost">Back to the map</Link>
      </div>
    </div>
  );
}
