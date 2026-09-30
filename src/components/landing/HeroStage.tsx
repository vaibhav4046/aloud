"use client";
import { Waveform, useMicLevel } from "@/components/ui/motion";
import { MicrophoneIcon, StopIcon } from "@/components/ui/icons";

const STATE_TEXT: Record<string, string> = {
  idle: "Idle. The wave breathes on its own.",
  asking: "Waiting for your browser to answer.",
  live: "Listening on this device only.",
  denied: "The microphone was blocked. The wave keeps breathing.",
  unsupported: "This browser has no microphone access. The wave keeps breathing.",
  error: "The microphone did not open. The wave keeps breathing.",
};

/**
 * The hero object. A real canvas waveform that breathes on its own and, if the
 * visitor presses the button and allows the microphone, follows their voice.
 * The microphone is never requested before that press, and the audio goes to
 * an analyser and nowhere else: nothing is recorded, stored or sent.
 */
export function HeroStage() {
  const { state, start, stop, analyserRef } = useMicLevel();
  const live = state === "live";

  return (
    <div className="al-stage">
      <Waveform analyserRef={analyserRef} height={220} label="A waveform that moves with your voice when the microphone is on" />
      <div className="al-stage-bar">
        <p className="al-stage-note">
          Try it: press the button, say a sentence, watch the bars follow. This is a meter only. Nothing is recorded or sent.
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <span className="al-stage-state" role="status" aria-live="polite">
            <span className="al-live-dot" data-live={live} aria-hidden="true" />
            {STATE_TEXT[state]}
          </span>
          <button type="button" className="btn-accent" onClick={live ? stop : start} aria-pressed={live} disabled={state === "asking"}>
            {live ? <StopIcon size={18} /> : <MicrophoneIcon size={18} />}
            {live ? "Stop listening" : "Let the wave hear you"}
          </button>
        </div>
      </div>
    </div>
  );
}
