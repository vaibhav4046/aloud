"use client";
import type { Progress } from "@/lib/game/types";
import { dailyRing, flameState } from "./map-model";
import { rankInfo, type Ctx } from "./engine-port";

/** The streak flame, drawn lit or unlit, with the freeze crystal when one is banked. */
export function FlameIcon({ lit, freezes }: { lit: boolean; freezes: number }) {
  return (
    <span className={`gx-flame${lit ? "" : " gx-flame--off"}`} aria-hidden="true">
      <svg viewBox="0 0 40 40">
        <defs>
          <linearGradient id="gx-fl" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#FFB23E" />
            <stop offset="1" stopColor="#E5482E" />
          </linearGradient>
        </defs>
        <path d="M20 3c1 7 8 10 8 19a8 8 0 0 1-16 0c0-4 2-6 3-9 2 2 3 3 4 4 1-4 0-9 1-14z" fill="url(#gx-fl)" />
        <path d="M20 21c1 3 4 4 4 8a4 4 0 0 1-8 0c0-3 3-5 4-8z" fill="#FFE7A8" />
      </svg>
      {freezes > 0 ? <span className="gx-ice">{freezes}</span> : null}
    </span>
  );
}

export function RingIcon({ fraction, met }: { fraction: number; met: boolean }) {
  const r = 18;
  const c = 2 * Math.PI * r;
  return (
    <span className={`gx-ring${met ? " gx-ring--met" : ""}`} aria-hidden="true">
      <svg viewBox="0 0 44 44">
        <circle className="gx-ring-bg" cx="22" cy="22" r={r} />
        <circle className="gx-ring-fg" cx="22" cy="22" r={r} strokeDasharray={c} strokeDashoffset={c * (1 - fraction)} />
      </svg>
    </span>
  );
}

/** Streak, daily goal and rank in three tiles. The rank card with its XP bar sits under them. */
export function StatusRail({ progress, ctx, showRank = true }: { progress: Progress; ctx: Ctx; showRank?: boolean }) {
  const flame = flameState(progress, ctx);
  const ring = dailyRing(progress, ctx);
  const rank = rankInfo(progress.xp);
  return (
    <section className="gx-rail" aria-label="Your status">
      <div className="gx-stats">
        <div className="gx-stat gx-card" title={flame.freezeCopy}>
          <FlameIcon lit={flame.lit} freezes={flame.freezes} />
          <b>{flame.days}</b>
          <small>{flame.days === 0 ? "Start a streak" : flame.lit ? "day streak" : "play today"}</small>
          <span className="gx-sr">{flame.copy}. {flame.freezeCopy}.</span>
        </div>
        <div className="gx-stat gx-card">
          <RingIcon fraction={ring.fraction} met={ring.met} />
          <b>{ring.shown}/{ring.goal}</b>
          <small>{ring.met ? "goal met" : "minutes today"}</small>
        </div>
        <div className="gx-stat gx-card">
          <span className="gx-rank-badge" style={{ width: 44, height: 44, borderRadius: 15, fontSize: "1.25rem" }} aria-hidden="true">{rank.rank}</span>
          <b>Rank {rank.rank}</b>
          <small className="gx-mono">{progress.xp} XP</small>
        </div>
      </div>
      {showRank ? (
        <div className="gx-rank gx-card">
          <span className="gx-rank-badge" aria-hidden="true">{rank.rank}</span>
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: "0.85rem" }}>
              <b>Rank {rank.rank}</b>
              <span className="gx-mono" style={{ color: "var(--g-ink-3)" }}>
                {rank.maxed ? "Top rank" : `${rank.xpIntoRank} / ${rank.xpForNext} XP`}
              </span>
            </div>
            <div className="gx-xpbar" role="progressbar" aria-label="XP to the next rank" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(rank.fraction * 100)}>
              <i style={{ transform: `scaleX(${rank.fraction})` }} />
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
