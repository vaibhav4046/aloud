import { describe, expect, it } from "vitest";
import { easeOutCubic } from "@/components/ui/motion/CountUp";
import { idleBarAmp } from "@/components/ui/motion/Waveform";

describe("count-up easing", () => {
  it("starts at 0, ends at 1 and clamps outside the range", () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(-3)).toBe(0);
    expect(easeOutCubic(7)).toBe(1);
  });

  it("is front-loaded: more than half the distance is covered by the halfway point", () => {
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.85);
  });
});

describe("idle waveform amplitude", () => {
  it("stays inside 0.04 and 1 for every bar at every sampled time", () => {
    for (let t = 0; t < 30; t += 0.37) {
      for (let i = 0; i < 41; i++) {
        const a = idleBarAmp(i, 41, t);
        expect(a).toBeGreaterThanOrEqual(0.04);
        expect(a).toBeLessThanOrEqual(1);
      }
    }
  });

  it("is taller in the middle of the row than at the edges, averaged over time", () => {
    const avg = (i: number) => {
      let sum = 0;
      let k = 0;
      for (let t = 0; t < 60; t += 0.1, k++) sum += idleBarAmp(i, 41, t);
      return sum / k;
    };
    expect(avg(20)).toBeGreaterThan(avg(1) * 1.5);
    expect(avg(20)).toBeGreaterThan(avg(39) * 1.5);
  });

  it("moves: the same bar differs at two times", () => {
    expect(idleBarAmp(10, 41, 0)).not.toBeCloseTo(idleBarAmp(10, 41, 1.9), 3);
  });
});
