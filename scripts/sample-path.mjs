#!/usr/bin/env node
/**
 * Front-door walk: open /, confirm the two hero links and the Bluff demo are there,
 * and that the oral session config for the sample course loads.
 *
 *   BASE_URL=http://localhost:3121 node scripts/sample-path.mjs
 *
 * Prints one line per check. Exit 1 on the first failure. One Chromium, closed at the end.
 */
import { chromium } from "@playwright/test";

const base = process.env.BASE_URL ?? "http://localhost:3121";
const browser = await chromium.launch();
let failed = false;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "pass" : "FAIL"} ${name}${detail ? ": " + detail : ""}`);
  if (!ok) failed = true;
};

try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const t0 = Date.now();
  await page.goto(base + "/", { waitUntil: "load" });
  check("landing has one h1", (await page.locator("h1").count()) === 1);
  const start = page.getByRole("link", { name: "Start the sample run" }).first();
  const href = await start.getAttribute("href");
  check("hero start link points at the sample course", /subjectId=course_transformers_w4/.test(href ?? ""), String(href));
  const upload = await page.getByRole("link", { name: "Upload your notes" }).first().getAttribute("href");
  check("hero upload link is present", Boolean(upload), String(upload));
  check("the Bluff demo renders", (await page.getByRole("button", { name: "Bluff" }).count()) === 1);
  const res = await page.evaluate(async () => {
    const r = await fetch("/api/oral/session?subjectId=course_transformers_w4", { cache: "no-store" });
    const b = await r.json().catch(() => null);
    return { status: r.status, hasPrompt: Boolean(b && b.system_prompt), subjectId: b && b.subjectId, code: b && b.error && b.error.code };
  });
  check("oral session config loads for the sample course", res.status === 200 && res.hasPrompt, JSON.stringify(res));
  await ctx.close();
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
