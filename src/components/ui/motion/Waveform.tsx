"use client";
import { useEffect, useRef, type RefObject } from "react";
import { useInView, usePrefersReducedMotion } from "./hooks";

/** Bar height, 0..1, for bar `i` of `n` at time `t` seconds. Pure, so it can be tested and reused. */
export function idleBarAmp(i: number, n: number, t: number): number {
  const u = n > 1 ? (i / (n - 1)) * 2 - 1 : 0; // -1..1 across the row
  const envelope = 0.2 + 0.8 * Math.exp(-u * u * 2.4); // tall in the middle, tapering out
  const wobble = 0.5 + 0.28 * Math.sin(t * 1.35 + i * 0.55) + 0.22 * Math.sin(t * 0.72 + i * 0.23 + 1.7);
  return Math.max(0.04, Math.min(1, envelope * wobble * 1.15));
}

function hexToRgb(hex: string): [number, number, number] {
  const c = hex.trim().replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(c)) return [27, 35, 33];
  return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)];
}

/**
 * The hero object: a row of rounded bars on a canvas. Idle, it breathes from a
 * sum of sines. Given the analyser from `useMicLevel`, each bar follows the
 * real spectrum of the visitor's voice, so the picture is a measurement and
 * not an animation of a measurement. The loop only runs while the canvas is on
 * screen and the tab is visible; under prefers-reduced-motion it paints one
 * still frame and redraws on resize.
 */
export function Waveform({
  analyserRef,
  bars,
  height = 200,
  className = "",
  label = "Voice waveform",
}: {
  analyserRef?: RefObject<AnalyserNode | null>;
  /** Fixed bar count. Default: one bar per 16 css pixels of width. */
  bars?: number;
  height?: number;
  className?: string;
  label?: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const visible = useInView(wrap, { once: false, rootMargin: "10% 0px", threshold: 0 });
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const el = canvas.current;
    const box = wrap.current;
    if (!el || !box || !visible) return;
    const ctx = el.getContext("2d");
    if (!ctx) return;

    const css = getComputedStyle(document.documentElement);
    const ink = hexToRgb(css.getPropertyValue("--primary"));
    const live = hexToRgb(css.getPropertyValue("--info"));

    let w = 0;
    let raf = 0;
    let stopped = false;
    const freq = new Uint8Array(256);
    const smooth: number[] = [];

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = box.clientWidth;
      el.width = Math.round(w * dpr);
      el.height = Math.round(height * dpr);
      el.style.width = `${w}px`;
      el.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = (t: number) => {
      const n = bars ?? Math.max(15, Math.min(61, Math.floor(w / 16) | 1));
      const analyser = analyserRef?.current ?? null;
      if (analyser) analyser.getByteFrequencyData(freq);
      ctx.clearRect(0, 0, w, height);
      const gap = w / n;
      const bw = Math.max(4, Math.min(12, gap * 0.56));
      for (let i = 0; i < n; i++) {
        const idle = idleBarAmp(i, n, t);
        let amp = idle;
        let mix = 0;
        if (analyser) {
          const u = Math.abs((i / (n - 1)) * 2 - 1);
          const bin = 1 + Math.floor(u * 38);
          const heard = Math.pow((freq[bin] ?? 0) / 255, 0.85);
          const env = 0.35 + 0.65 * Math.exp(-u * u * 2.0);
          const target = Math.min(1, heard * env * 1.5 + 0.05);
          smooth[i] = (smooth[i] ?? target) * 0.55 + target * 0.45;
          amp = Math.max(0.05, smooth[i]);
          mix = Math.min(1, amp * 1.4);
        }
        const h = Math.max(bw, amp * (height - 8));
        const x = gap * (i + 0.5) - bw / 2;
        const y = (height - h) / 2;
        const r = Math.round(ink[0] + (live[0] - ink[0]) * mix);
        const g = Math.round(ink[1] + (live[1] - ink[1]) * mix);
        const b = Math.round(ink[2] + (live[2] - ink[2]) * mix);
        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        ctx.beginPath();
        ctx.roundRect(x, y, bw, h, bw / 2);
        ctx.fill();
      }
    };

    resize();
    const ro = new ResizeObserver(() => {
      resize();
      if (reduced) draw(1.7);
    });
    ro.observe(box);

    if (reduced) {
      draw(1.7);
    } else {
      const t0 = performance.now();
      const loop = (now: number) => {
        if (stopped) return;
        if (!document.hidden) draw((now - t0) / 1000);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    }

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [visible, reduced, bars, height, analyserRef]);

  return (
    <div ref={wrap} className={className} style={{ width: "100%", height }}>
      <canvas ref={canvas} role="img" aria-label={label} style={{ display: "block" }} />
    </div>
  );
}
