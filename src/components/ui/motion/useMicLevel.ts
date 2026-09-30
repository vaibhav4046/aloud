"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export type MicMeterState = "idle" | "asking" | "live" | "denied" | "unsupported" | "error";

/**
 * A microphone meter and nothing else. It opens the mic only when `start()` is
 * called (from a button press), feeds it to an AnalyserNode for drawing, and
 * never records, stores or sends a sample: the graph has no destination, so
 * the audio goes nowhere. `stop()` and unmount release the track and close the
 * context, which turns the browser's recording indicator off.
 *
 * Returns the analyser in a ref, so an animation loop can read it every frame
 * without re-rendering React.
 */
export function useMicLevel() {
  const [state, setState] = useState<MicMeterState>("idle");
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);

  const release = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    analyserRef.current = null;
    const ctx = ctxRef.current;
    ctxRef.current = null;
    if (ctx && ctx.state !== "closed") void ctx.close();
  }, []);

  const stop = useCallback(() => {
    release();
    setState("idle");
  }, [release]);

  const start = useCallback(async () => {
    if (streamRef.current) return;
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setState("unsupported");
      return;
    }
    setState("asking");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      const Ctx: typeof AudioContext = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.72;
      ctx.createMediaStreamSource(stream).connect(analyser);
      streamRef.current = stream;
      ctxRef.current = ctx;
      analyserRef.current = analyser;
      setState("live");
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      setState(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "error");
    }
  }, []);

  useEffect(() => release, [release]);

  return { state, start, stop, analyserRef } as const;
}
