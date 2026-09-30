import { describe, expect, it } from "vitest";
import { buildBluffDemo } from "@/lib/landing/bluff-demo";
import { getCourse } from "@/lib/courses";
import { SAMPLE_COURSE_ID } from "@/lib/sample-course";

/*
 * The Spot-the-Bluff mini-demo on the landing page quotes the sample course.
 * These tests keep every claim and every quoted page real.
 */
describe("landing bluff demo", () => {
  const rounds = buildBluffDemo();
  const course = getCourse(SAMPLE_COURSE_ID);
  const pages = course.sources.flatMap((s) => s.chunks);

  it("has both real statements and bluffs", () => {
    expect(rounds.length).toBeGreaterThanOrEqual(3);
    expect(rounds.some((r) => r.verdict === "bluff")).toBe(true);
    expect(rounds.some((r) => r.verdict === "true")).toBe(true);
  });

  it("every bluff is a trap the course already carries, word for word", () => {
    const traps = new Set(course.traps.map((t) => t.statement));
    for (const r of rounds.filter((x) => x.verdict === "bluff")) expect(traps.has(r.claim)).toBe(true);
  });

  it("every quote is a verbatim substring of a real page, and the page number matches", () => {
    for (const r of rounds) {
      const whole = r.proof.before.replace(/^…/, "") + r.proof.quote + r.proof.after.replace(/…$/, "");
      const page = pages.find((c) => c.text.includes(whole));
      expect(page, `context of ${r.id} is in a page`).toBeDefined();
      expect(page?.locator.page).toBe(r.proof.page);
    }
  });

  it("every true statement is not one of the course traps", () => {
    const traps = new Set(course.traps.map((t) => t.statement));
    for (const r of rounds.filter((x) => x.verdict === "true")) expect(traps.has(r.claim)).toBe(false);
  });
});

describe("landing bluff demo page label", () => {
  it("shows the section name without its chapter number", () => {
    for (const r of buildBluffDemo()) expect(r.proof.section).not.toMatch(/^\d/);
  });
});
