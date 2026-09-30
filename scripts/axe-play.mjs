#!/usr/bin/env node
/** axe-core on the game screens, one Chromium. BASE_URL=http://localhost:3241 node scripts/axe-play.mjs */
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const base = process.env.BASE_URL ?? "http://localhost:3241";
const RUN = "run_course_transformers_w4";
const browser = await chromium.launch();
let bad = 0;
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(`${base}/run/new?sample=1`, { waitUntil: "networkidle" });
  await page.waitForURL(/\/run\/run_/, { timeout: 60000 });
  const run = await page.evaluate((id) => JSON.parse(localStorage.getItem(`aloud.run.${id}`)), RUN);
  await page.evaluate(([run, rid]) => localStorage.setItem(`aloud.progress.${rid}`, JSON.stringify({ runId: rid, xp: 300, rank: 2, unlockedIndex: 6, streakDays: 0, lastPlayedDay: null, freezes: 0, results: Object.fromEntries(run.levels.slice(0, 5).map((l) => [l.id, { levelId: l.id, stars: 3, xp: 100, heartsLeft: 3, bestCombo: 1, rounds: [], proofIds: [], outcome: "won", playedAt: "2026-09-29T10:00:00.000Z" }])), proofs: [], weakConceptIds: [], dailyGoalMinutes: 10, todayMinutes: 0, updatedAt: new Date().toISOString() })), [run, RUN]);
  const paths = ["/run/new", `/run/${RUN}`, `/play/${run.levels[0].id}?run=${RUN}`, `/play/${run.levels[1].id}?run=${RUN}`, "/proofs", "/me"];
  for (const p of paths) {
    await page.goto(base + p, { waitUntil: "networkidle" });
    if (p.startsWith("/play")) {
      await page.getByRole("button", { name: /Play by typing/ }).first().click();
      await page.waitForSelector('[data-phase="live"]');
    }
    await page.waitForTimeout(800);
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    const v = r.violations.map((x) => `${x.id}(${x.nodes.length}): ${x.nodes[0].target.join(" ")}`);
    bad += v.length;
    console.log(JSON.stringify({ path: p.split("?")[0], violations: v }));
  }
} finally {
  await browser.close();
}
process.exit(bad ? 1 : 0);
