import { existsSync, readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

/*
 * A `vercel deploy` failed on a missing `_global-error.segments/__PAGE__.segment.rsc.func`.
 * Explicit error boundaries (the app one, the root one and the /run and /play ones) and a
 * designed global-error give the build every boundary it looks for, and give a player who
 * hits a crash a screen in the Aloud look with a way forward instead of Next's white page.
 */

const FILES = [
  "src/app/error.tsx",
  "src/app/global-error.tsx",
  "src/app/(app)/error.tsx",
  "src/app/(app)/run/error.tsx",
  "src/app/(app)/run/loading.tsx",
  "src/app/(app)/play/[levelId]/error.tsx",
  "src/app/(app)/play/[levelId]/loading.tsx",
];

describe("route boundaries exist", () => {
  for (const f of FILES) it(`${f} exists`, () => expect(existsSync(new URL(`../${f}`, import.meta.url))).toBe(true));

  it("error boundaries are client components and global-error renders its own document", () => {
    for (const f of FILES.filter((x) => x.endsWith("error.tsx"))) {
      const src = readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
      expect(src.startsWith('"use client"')).toBe(true);
    }
    const g = readFileSync(new URL("../src/app/global-error.tsx", import.meta.url), "utf8");
    expect(g).toMatch(/<html/);
    expect(g).toMatch(/<body/);
  });

  it("no boundary copy uses a dash, an exclamation mark or a banned word", () => {
    for (const f of FILES) {
      const src = readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
      expect(src).not.toMatch(/[–—]/);
      expect(src).not.toMatch(/>[^<{]*![^<{]*</);
    }
  });
});

describe("the error panel", () => {
  it("says what happened, offers a retry and a way back, and shows the reference when there is one", async () => {
    const { ErrorPanel } = await import("../src/components/ErrorPanel");
    const html = renderToStaticMarkup(createElement(ErrorPanel, { onRetry: () => undefined, digest: "abc123", where: "the level" }));
    expect(html).toMatch(/role="alert"/);
    expect(html).toMatch(/Try again/);
    expect(html).toMatch(/href="\/run"/);
    expect(html).toMatch(/abc123/);
    expect(html).toMatch(/the level/);
    expect(html).not.toMatch(/!/);
  });
});
