"use client";
import { useState } from "react";
import Link from "next/link";
import { Hearts } from "@/components/ui/game-bits";
import type { BluffRound } from "@/lib/landing/bluff-demo";
import { SAMPLE_RUN_HREF } from "@/lib/landing/links";

const HEARTS = 3;
/** Same numbers the game scores with: correct 100, bluff caught 150, plus 25 when a page backs the answer. */
const XP = { true: 100, bluff: 150, grounded: 25 } as const;

type Pick = "true" | "bluff";

/**
 * The mini-demo of the Bluff mechanic. The examiner states a claim taken from
 * the sample course; the visitor says True or Bluff; the page that settles it
 * is shown with the settling words highlighted. Hearts and XP use the real
 * scoring numbers. Everything is client state, no network, and the claims and
 * quotes come from the course through src/lib/landing/bluff-demo.ts.
 */
export function BluffDemo({ rounds }: { rounds: BluffRound[] }) {
  const [i, setI] = useState(0);
  const [pick, setPick] = useState<Pick | null>(null);
  const [hearts, setHearts] = useState(HEARTS);
  const [xp, setXp] = useState(0);
  const [caught, setCaught] = useState(0);

  const done = i >= rounds.length;
  const round = rounds[Math.min(i, rounds.length - 1)];
  const right = pick !== null && pick === round.verdict;

  function choose(p: Pick) {
    if (pick) return;
    setPick(p);
    if (p === round.verdict) {
      setXp((x) => x + XP[round.verdict] + XP.grounded);
      if (round.verdict === "bluff") setCaught((c) => c + 1);
    } else {
      setHearts((h) => Math.max(0, h - 1));
    }
  }

  function next() {
    setPick(null);
    setI((n) => n + 1);
  }

  function again() {
    setI(0);
    setPick(null);
    setHearts(HEARTS);
    setXp(0);
    setCaught(0);
  }

  if (done) {
    return (
      <div className="al-demo" aria-live="polite">
        <div className="al-demo-head">
          <span className="eyebrow">Demo finished</span>
          <Hearts left={hearts} max={HEARTS} size={22} />
        </div>
        <p className="al-claim" style={{ minHeight: 0 }}>
          {caught === 0 ? "No bluff caught this time." : `${caught} bluff${caught === 1 ? "" : "s"} caught.`} <span className="al-xp">{xp} XP.</span>
        </p>
        <p style={{ margin: "12px 0 0", color: "var(--text-secondary)" }}>
          In a real run the claims come from your own notes, and every answer that checks out becomes a proof card you keep.
        </p>
        <div className="al-demo-foot">
          <button type="button" className="btn-ghost" onClick={again}>
            Play the demo again
          </button>
          <Link href={SAMPLE_RUN_HREF} className="btn-primary">
            Start the sample run
          </Link>
        </div>
      </div>
    );
  }

  const { proof } = round;
  return (
    <div className="al-demo">
      <div className="al-demo-head">
        <span className="eyebrow">
          Claim {i + 1} of {rounds.length} from the sample notes
        </span>
        <Hearts left={hearts} max={HEARTS} size={22} />
      </div>

      <p className="al-claim">&ldquo;{round.claim}&rdquo;</p>

      <div className="al-choices" role="group" aria-label="Is the examiner telling the truth?">
        <button type="button" className="al-choice" data-picked={pick === "true"} disabled={pick !== null} onClick={() => choose("true")}>
          True
        </button>
        <button type="button" className="al-choice" data-picked={pick === "bluff"} disabled={pick !== null} onClick={() => choose("bluff")}>
          Bluff
        </button>
      </div>

      <div aria-live="polite">
        {pick && (
          <>
            <div className="al-verdict" data-ok={right}>
              <strong>{right ? (round.verdict === "bluff" ? "Caught." : "Right.") : round.verdict === "bluff" ? "It was a bluff." : "That one was true."}</strong>
              <p>
                {round.because}{" "}
                {right ? (
                  <span className="al-xp">+{XP[round.verdict] + XP.grounded} XP</span>
                ) : (
                  <span className="al-xp">One heart lost.</span>
                )}
              </p>
            </div>
            <div className="al-proof">
              <span className="al-page-tag">
                Page {proof.page} &middot; {proof.section}
              </span>
              <blockquote>
                {proof.before}
                <mark>{proof.quote}</mark>
                {proof.after}
              </blockquote>
              <p className="method">The highlighted words are a verbatim match, checked by code against the page.</p>
            </div>
          </>
        )}
      </div>

      <div className="al-demo-foot">
        <span className="al-xp" aria-label={`${xp} XP so far`}>
          {xp} XP
        </span>
        {pick && (
          <button type="button" className="btn-primary" onClick={next} autoFocus>
            {i + 1 < rounds.length ? "Next claim" : "See the result"}
          </button>
        )}
      </div>
    </div>
  );
}
