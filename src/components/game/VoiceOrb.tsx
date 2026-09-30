"use client";
import { useEffect, useRef } from "react";

export type OrbMode = "idle" | "listening" | "user" | "examiner" | "thinking" | "checking";

type Levels = { learner: number; examiner: number };

const BARS = 64;

/** Smooth toward a target, quick to rise and slow to fall, so speech reads as a wave and not as noise. */
export function follow(prev: number, next: number): number {
  return next > prev ? prev + (next - prev) * 0.55 : prev + (next - prev) * 0.14;
}

/**
 * The voice orb. It is drawn from `read()`, which the mic layer backs with
 * AnalyserNodes on the real microphone (learner) and the real playback
 * (examiner), so the ring moves with the actual sound in the room. With no
 * `read` (before the mic opens, or typed play) it rests as a still ring.
 * Reduced motion keeps the same real levels but redraws slowly with no easing.
 */
export function VoiceOrb({ read, mode, reduced }: { read?: () => Levels; mode: OrbMode; reduced: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const size = 520;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);
    const css = getComputedStyle(canvas);
    const pick = (name: string, fb: string) => css.getPropertyValue(name).trim() || fb;
    const lav = pick("--wash-lavender", "#E4D6FA");
    const mint = pick("--wash-mint", "#CDEBDD");
    const peach = pick("--wash-peach", "#FFD9C4");
    const ink = pick("--primary", "#1B2321");
    const info = pick("--info", "#4A3FA3");

    let raf = 0;
    let last = 0;
    let learner = 0;
    let examiner = 0;
    const phase = Array.from({ length: BARS }, (_, i) => (i * 2.399963) % (Math.PI * 2));

    const draw = (t: number) => {
      const m = modeRef.current;
      const raw = read ? read() : { learner: 0, examiner: 0 };
      learner = reduced ? raw.learner : follow(learner, raw.learner);
      examiner = reduced ? raw.examiner : follow(examiner, raw.examiner);
      const amp = m === "examiner" ? examiner : m === "user" ? learner : Math.max(learner, examiner) * 0.6;
      const breathe = reduced ? 0 : Math.sin(t / 900) * 0.02 + (m === "thinking" || m === "checking" ? Math.sin(t / 260) * 0.03 : 0);
      const c = size / 2;
      const base = 92;
      const r = base + amp * 34 + breathe * base;

      ctx.clearRect(0, 0, size, size);

      // halo
      const halo = ctx.createRadialGradient(c, c, r * 0.6, c, c, r * 2);
      halo.addColorStop(0, m === "examiner" ? mint : m === "user" ? peach : lav);
      halo.addColorStop(1, "rgba(255,255,255,0)");
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, size, size);
      ctx.globalAlpha = 1;

      // ring of bars, length from the real level with a per-bar phase so it reads as a wave
      ctx.lineCap = "round";
      ctx.lineWidth = 5;
      for (let i = 0; i < BARS; i++) {
        const a = (i / BARS) * Math.PI * 2 - Math.PI / 2;
        const wave = 0.5 + 0.5 * Math.sin(phase[i] + (reduced ? 0 : t / 220));
        const len = 6 + amp * 62 * (0.35 + 0.65 * wave) + (m === "idle" ? 0 : 3);
        const r0 = r + 14;
        ctx.strokeStyle = m === "examiner" ? "#1F6B4A" : m === "user" ? "#B4501A" : info;
        ctx.globalAlpha = 0.35 + 0.65 * Math.min(1, amp * 2 + 0.2);
        ctx.beginPath();
        ctx.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0);
        ctx.lineTo(c + Math.cos(a) * (r0 + len), c + Math.sin(a) * (r0 + len));
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // core
      const core = ctx.createRadialGradient(c - r * 0.3, c - r * 0.35, r * 0.1, c, c, r);
      core.addColorStop(0, "#FFFFFF");
      core.addColorStop(0.45, m === "examiner" ? mint : m === "user" ? peach : lav);
      core.addColorStop(1, m === "examiner" ? "#8FCBB0" : m === "user" ? "#F3A98C" : "#BFA6EE");
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(c, c, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.8)";
      ctx.lineWidth = 3;
      ctx.stroke();

      // a small ink dot at the centre so the orb has a focal point
      ctx.fillStyle = ink;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.arc(c, c, 6 + amp * 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    };

    const loop = (t: number) => {
      // Reduced motion redraws about six times a second; otherwise every frame.
      if (!reduced || t - last > 160) {
        last = t;
        draw(t);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [read, reduced]);

  return <canvas ref={ref} className="gx-orb" aria-hidden="true" data-mode={mode} />;
}
