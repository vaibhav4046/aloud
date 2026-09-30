"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Keyboard, Mic, MicOff, X } from "lucide-react";
import type { CatchItem, SayItem } from "@/lib/game/types";
import { highlightParts } from "./highlight";
import { announceRound } from "./play-model";
import type { CatchReveal, LevelView } from "./level-view";
import { ClaimCard, Captions, ComboMeter, FeedbackToast, Hearts, PeekDrawer, PromptCard, ProofReveal, RoundPips } from "./PlayParts";
import { MicDenied } from "./StateViews";
import { VoiceOrb } from "./VoiceOrb";
import { KIND_LABEL } from "./map-model";

const INTRO: Record<string, string> = {
  say: "Explain each idea in your own words. The examiner checks what you say against your own pages.",
  catch: "The examiner states claims from your notes. Some are real and some are altered. Catch the bluff and give the correction, or confirm it is true.",
  boss: "Rapid questions across the whole world. The examiner may cut in. You have four hearts.",
  recall: "Ideas you missed earlier, back for another go. Clear them and they leave your weak list.",
};

const MIC_IDS = new Set(["mic_denied", "no_audio_device", "insecure_context", "no_audio_worklet"]);

function Marked({ text, marks, tone }: { text: string; marks: string[]; tone: "bad" | "ok" }) {
  return (
    <>
      {highlightParts(text, marks).map((p, i) =>
        p.hit && marks.length ? (
          <mark key={i} style={{ background: tone === "bad" ? "var(--g-bad-tint)" : "var(--g-ok-tint)", color: "inherit", borderRadius: 4, padding: "0 3px" }}>{p.text}</mark>
        ) : (
          <span key={i}>{p.text}</span>
        )
      )}
    </>
  );
}

/** After a catch round: what the examiner said, what your page says, and what was changed. */
function RevealCard({ reveal, onClose }: { reveal: CatchReveal; onClose: () => void }) {
  const { item } = reveal;
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => closeRef.current?.focus(), []);
  return (
    <section className="gx-card" style={{ padding: 20, display: "grid", gap: 12 }} aria-label="The answer" role="region">
      <p className="gx-eyebrow">{item.isBluff ? "That was a bluff" : "That claim was real"}</p>
      <p style={{ margin: 0, fontFamily: "var(--g-display)", fontSize: "1.15rem", lineHeight: 1.4 }}>
        <span className="gx-eyebrow">Claimed </span>
        <Marked text={item.claim} marks={item.alteration ? [item.alteration.to] : []} tone="bad" />
      </p>
      <p style={{ margin: 0, fontFamily: "var(--g-display)", fontSize: "1.15rem", lineHeight: 1.4 }}>
        <span className="gx-eyebrow">Your page{item.page != null ? `, p. ${item.page}` : ""} </span>
        <Marked text={item.source} marks={item.alteration ? [item.alteration.from] : []} tone="ok" />
      </p>
      <p className="gx-note" style={{ color: "var(--g-ok)", fontWeight: 600 }}>The page line is checked by code against your notes.</p>
      <button ref={closeRef} type="button" className="gx-btn gx-btn--ghost gx-btn--sm" style={{ justifySelf: "start" }} onClick={onClose}>Continue</button>
    </section>
  );
}

function TypedBox({ v, label, placeholder, submitLabel }: { v: LevelView; label: string; placeholder: string; submitLabel: string }) {
  const [text, setText] = useState("");
  const id = useId();
  const ref = useRef<HTMLTextAreaElement>(null);
  const roundKey = v.play.roundIndex;
  useEffect(() => {
    setText("");
    // A new round hands the keyboard to the answer box, as the written exam does.
    ref.current?.focus();
  }, [roundKey]);
  const send = () => {
    if (!text.trim() || v.pending) return;
    v.actions.submitTyped(text.trim());
  };
  return (
    <form
      className="gx-typed"
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      <label htmlFor={id} className="gx-eyebrow">{label}</label>
      <textarea
        id={id}
        ref={ref}
        value={text}
        maxLength={2000}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
            e.preventDefault();
            send();
          }
        }}
        aria-describedby={`${id}-h`}
      />
      <div className="gx-typed-row">
        <span id={`${id}-h`} className="gx-note">Ctrl+Enter sends. It is checked against your pages, the same as a spoken answer.</span>
        <button type="submit" className="gx-btn" disabled={!text.trim() || v.pending} aria-busy={v.pending}>
          {v.pending ? "Checking your page" : submitLabel}
        </button>
      </div>
    </form>
  );
}

function Intro({ v }: { v: LevelView }) {
  const { level } = v;
  return (
    <section className="gx-prompt gx-card">
      <div className="gx-prompt-kind"><span className="gx-chip">{KIND_LABEL[level.kind]}</span><span className="gx-eyebrow">{level.rounds} rounds · {level.hearts} hearts</span></div>
      <h1 className="gx-prompt-text">{level.title}</h1>
      <p className="gx-lede">{INTRO[level.kind]}</p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {v.mode === "voice" ? (
          <button type="button" className="gx-btn gx-btn--lg" onClick={v.actions.startVoice}><Mic size={20} aria-hidden="true" /> Start talking</button>
        ) : null}
        <button type="button" className={`gx-btn gx-btn--lg${v.mode === "voice" ? " gx-btn--ghost" : ""}`} onClick={v.actions.startTyped}><Keyboard size={20} aria-hidden="true" /> Play by typing</button>
      </div>
      <p className="gx-note">Headphones help. Typed play scores the same as voice. Sound effects are off unless you turn them on in your profile.</p>
    </section>
  );
}

export function PlayScreen({ v, worldName, reduced }: { v: LevelView; worldName: string; reduced: boolean }) {
  const { play, level, item } = v;
  const [typedOpen, setTypedOpen] = useState(false);
  const [peek, setPeek] = useState(false);
  const [correction, setCorrection] = useState("");
  const [picked, setPicked] = useState<"bluff" | "real" | null>(null);
  const live = play.phase === "live";
  const isCatch = item?.type === "catch";
  const hintText = item && item.type === "say" ? item.hint : null;

  useEffect(() => {
    setPicked(null);
    setCorrection("");
    setPeek(false);
  }, [play.roundIndex]);

  const micFailure = v.failure && MIC_IDS.has(v.failure.id);
  const round = Math.min(level.rounds, play.roundIndex + 1);

  return (
    <div className="gx-play gx-wrap" data-testid="play-screen" data-phase={play.phase}>
      <header className="gx-play-top">
        <button type="button" className="gx-iconbtn" onClick={v.actions.end} aria-label="Leave the level and go back to the map"><X size={20} aria-hidden="true" /></button>
        <div style={{ textAlign: "center", minWidth: 0 }}>
          <div className="gx-eyebrow" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{worldName}</div>
          <div style={{ fontWeight: 600, fontSize: "0.95rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Level {level.index}</div>
        </div>
        <Hearts hearts={play.run.hearts} max={level.hearts} hitSeq={play.last?.heartLost ? play.last.seq : 0} />
      </header>
      <RoundPips total={level.rounds} outcomes={play.run.rounds} hasNow={live} />

      <div className="gx-play-body">
        {play.phase !== "ready" ? (
          <div className="gx-meta">
            <ComboMeter streak={play.run.combo} />
            <span className="gx-chip gx-mono">{play.run.xp} XP</span>
          </div>
        ) : null}

        {v.notice ? <p className="gx-note" role="status">{v.notice}</p> : null}

        {micFailure && v.failure ? (
          <MicDenied reason={`${v.failure.cause}. ${v.failure.message}`} onRetry={v.actions.startVoice} onTyped={v.actions.switchToTyped} />
        ) : v.failure ? (
          <div className="gx-state gx-card gx-state--bad" role="alert">
            <h2 className="gx-h2">{v.failure.title}</h2>
            <p className="gx-lede">{v.failure.message}</p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button type="button" className="gx-btn" onClick={v.actions.startVoice}>Try again</button>
              <button type="button" className="gx-btn gx-btn--ghost" onClick={v.actions.switchToTyped}>Play by typing</button>
            </div>
          </div>
        ) : play.phase === "ready" ? (
          <Intro v={v} />
        ) : v.reveal ? (
          <RevealCard reveal={v.reveal} onClose={v.actions.dismissReveal} />
        ) : live && item ? (
          <>
            {isCatch ? (
              <ClaimCard
                claim={(item as CatchItem).claim}
                round={round}
                total={level.rounds}
                choice={picked}
                disabled={v.pending}
                onChoose={(c) => {
                  setPicked(c);
                  v.actions.choose(c, correction.trim() || undefined);
                }}
              />
            ) : (
              <PromptCard
                kind={level.kind}
                round={round}
                total={level.rounds}
                text={(item as SayItem).question}
                hint={hintText}
                hintShown={play.hinted}
                onHint={v.actions.hint}
                onPeek={() => {
                  if (!play.hinted) v.actions.peek();
                  setPeek(true);
                }}
              />
            )}

            {isCatch ? (
              <label style={{ display: "grid", gap: 6 }}>
                <span className="gx-eyebrow">If you catch it, say or type the correct version</span>
                <input className="gx-field" style={{ minHeight: 52 }} value={correction} onChange={(e) => setCorrection(e.target.value)} placeholder="The page says that..." maxLength={400} />
              </label>
            ) : null}

            {v.mode === "voice" ? (
              <>
                <div className="gx-orb-wrap">
                  <VoiceOrb read={v.readLevels} mode={v.orbMode} reduced={reduced} />
                </div>
                <div className="gx-orb-state" role="status" aria-live="polite">
                  <b>{v.pending ? "Checking your page" : v.stateLine}</b>
                  <span>{v.stateHint}</span>
                </div>
                <Captions examiner={v.examinerText} cut={v.examinerCut} you={v.youText} />
              </>
            ) : null}

            {v.mode === "typed" || typedOpen ? (
              isCatch ? null : <TypedBox v={v} label="Your answer" placeholder="Answer in your own words." submitLabel="Check my answer" />
            ) : null}

            {v.mode === "voice" && !isCatch ? (
              <div className="gx-dock-row">
                <button type="button" className="gx-btn gx-btn--ghost" aria-expanded={typedOpen} onClick={() => setTypedOpen((o) => !o)}>
                  <Keyboard size={18} aria-hidden="true" /> {typedOpen ? "Hide typing" : "Type instead"}
                </button>
                <button type="button" className="gx-btn gx-btn--ghost" onClick={v.actions.switchToTyped}><MicOff size={18} aria-hidden="true" /> Turn the mic off</button>
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      {play.last && live ? <FeedbackToast key={play.last.seq} fb={play.last} /> : null}
      {v.proofView ? <ProofReveal proof={v.proofView} onClose={v.actions.dismissProof} /> : null}
      {peek ? <PeekDrawer subjectId={v.subjectId} focusPassageId={v.peekPassageId} onClose={() => setPeek(false)} /> : null}
      <p className="gx-sr" role="status" aria-live="polite">{v.announce || (play.last ? announceRound(play.last, play.run.hearts) : "")}</p>
    </div>
  );
}
