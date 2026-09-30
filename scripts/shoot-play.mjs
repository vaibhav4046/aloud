#!/usr/bin/env node
/**
 * Screenshots and measurements of the game screens, driven through the real app.
 *
 *   BASE_URL=http://localhost:3241 node scripts/shoot-play.mjs [--widths 390,768,1440] [--only map,play,result,proofs]
 *
 * ONE Chromium, one context at a time. States are reached through the app itself:
 * the sample run is built through /run/new, progress is seeded into localStorage
 * under the same key the app writes (so the map is drawn from real persisted
 * data), and level play is typed play against the real tool route. Nothing is
 * mocked. Writes docs/evidence/visual/play/<state>-<width>.png and prints one
 * JSON line per shot with overflow, console errors and the time from the answer
 * click to the first feedback element (the 300 ms budget).
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const value = (n) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};
const base = process.env.BASE_URL ?? "http://localhost:3241";
const widths = (value("--widths") ?? "390,768,1440").split(",").map(Number);
const only = value("--only") ? value("--only").split(",") : null;
const out = path.join("docs", "evidence", "visual", "play");
fs.mkdirSync(out, { recursive: true });
const want = (s) => !only || only.includes(s);

const RUN_ID = "run_course_transformers_w4";
const heightFor = (w) => (w < 700 ? 844 : w < 1100 ? 1024 : 900);
const log = (o) => console.log(JSON.stringify(o));

function seed(run) {
  // Levels 1..5 cleared with mixed stars, level 6 next: a mid-run state written the way the app writes it.
  const stars = [3, 3, 2, 3, 1];
  const results = {};
  run.levels.slice(0, 5).forEach((l, i) => {
    results[l.id] = { levelId: l.id, stars: stars[i], xp: 220, heartsLeft: 2, bestCombo: 3, rounds: [], proofIds: [], outcome: "won", playedAt: "2026-09-29T10:00:00.000Z", ms: 90000 };
  });
  const now = new Date();
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const y = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now.getTime() - 86400000));
  return {
    runId: run.id, xp: 1240, rank: 4, unlockedIndex: 6, streakDays: 5, lastPlayedDay: y, freezes: 1,
    results,
    proofs: [
      { id: "p1", conceptId: run.levels[0].conceptIds[0], quote: "For each pair, the model computes a compatibility score, normalises the scores with a softmax into weights, and returns a weighted average of the value vectors.", page: 4, passageId: "ch_sa_1", levelId: run.levels[0].id, earnedAt: "2026-09-29T10:00:00.000Z" },
      { id: "p2", conceptId: run.levels[2].conceptIds[0], quote: "Queries, keys and values are three linear projections of the same input.", page: 5, passageId: "ch_qkv_1", levelId: run.levels[2].id, earnedAt: "2026-09-29T10:05:00.000Z" },
    ],
    weakConceptIds: [run.levels[1].conceptIds[0]], dailyGoalMinutes: 10, todayMinutes: 6.5, todayDay: day, updatedAt: now.toISOString(),
  };
}

const browser = await chromium.launch();
try {
  for (const width of widths) {
    const context = await browser.newContext({ viewport: { width, height: heightFor(width) }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const errors = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 200)));
    page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
    const shot = async (name, opts = {}) => {
      await page.waitForTimeout(opts.settle ?? 900);
      const file = path.join(out, `${name}-${width}.png`);
      await page.screenshot({ path: file, fullPage: opts.full ?? false });
      const m = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
      log({ shot: file.replaceAll("\\", "/"), width, ...m, consoleErrors: errors.length });
    };

    // 1. Build through the app: the sample path.
    await page.goto(`${base}/run/new`, { waitUntil: "networkidle" });
    if (want("build")) await shot("build-idle");
    await page.getByRole("button", { name: /Use the sample/ }).click();
    await page.waitForURL(/\/run\/run_/, { timeout: 60000 });
    await page.waitForSelector('[data-testid="run-map"]');

    const run = await page.evaluate((id) => JSON.parse(localStorage.getItem(`aloud.run.${id}`)), RUN_ID);
    if (want("map")) await shot("map-fresh", { full: false });

    // 2. Mid-run map from seeded, persisted progress.
    await page.evaluate(([id, p]) => localStorage.setItem(`aloud.progress.${id}`, JSON.stringify(p)), [RUN_ID, seed(run)]);
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForSelector('[data-testid="run-map"]');
    if (want("map")) {
      await shot("map-mid", { settle: 1400 });
      await shot("map-mid-full", { full: true, settle: 300 });
    }
    if (want("proofs")) {
      await page.goto(`${base}/proofs`, { waitUntil: "networkidle" });
      await shot("proofs");
    }
    if (want("me")) {
      await page.goto(`${base}/me`, { waitUntil: "networkidle" });
      await shot("me", { full: true });
    }

    // 3. Play the next level by typing, against the real tool route.
    if (want("play") || want("result")) {
      const next = run.levels[5];
      await page.goto(`${base}/play/${next.id}?run=${RUN_ID}`, { waitUntil: "networkidle" });
      await page.getByRole("button", { name: /Play by typing/ }).first().click();
      await page.waitForSelector('[data-phase="live"]');
      await shot("play-say");
      const answers = [
        "Self-attention on its own is permutation-equivariant: if you shuffle the input tokens the outputs shuffle the same way, so it cannot see word order. Positional information is added so the model can tell which token comes where.",
        "It would struggle to tell the order of the tokens, because attention treats the sequence as a set. Without positional encodings a permutation of the input gives the same computation, only permuted.",
        "Positional encodings are added to the token embeddings so that attention can use position and order, which breaks the permutation symmetry of self-attention.",
      ];
      for (let i = 0; i < next.rounds; i++) {
        const box = page.getByLabel("Your answer");
        if (!(await box.count())) break;
        await box.fill(answers[i % answers.length]);
        const done = () => page.evaluate(() => document.querySelectorAll(".gx-rounds i.done, .gx-rounds i.miss").length);
        const before = await done();
        const t0 = Date.now();
        await page.getByRole("button", { name: /Check my answer/ }).click();
        await page.getByRole("button", { name: /Checking your page/ }).waitFor({ timeout: 2000 });
        const msToPending = Date.now() - t0;
        await page.waitForFunction((n) => document.querySelectorAll(".gx-rounds i.done, .gx-rounds i.miss").length > n || document.querySelector("[data-testid=result]"), before, { timeout: 45000 });
        log({ round: i + 1, msToPendingLabel: msToPending, msToResult: Date.now() - t0 });
        if (i === 0) await shot("play-feedback", { settle: 200 });
        const keep = page.getByRole("button", { name: /Keep going/ });
        if (await keep.count()) {
          if (i === 0) await shot("play-proof", { settle: 900 });
          await keep.first().click().catch(() => {});
        }
        await page.waitForTimeout(400);
      }
      if (want("result")) {
        await page.waitForSelector('[data-testid="result"]', { timeout: 60000 });
        await shot("result", { settle: 2600 });
      }
    }

    // 4. A catch level.
    if (want("catch")) {
      await page.goto(`${base}/play/${run.levels[1].id}?run=${RUN_ID}`, { waitUntil: "networkidle" });
      await page.getByRole("button", { name: /Play by typing/ }).first().click();
      await page.waitForSelector('[data-phase="live"]');
      await shot("play-catch");
      await page.waitForTimeout(2500); // the claim check starts when the claim is shown; the player reads first
      const t0 = Date.now();
      await page.getByRole("button", { name: /That is true/ }).click();
      await page.waitForSelector("[aria-label='The answer']", { timeout: 15000 });
      log({ catchTapToFeedbackMs: Date.now() - t0 });
      await shot("play-catch-reveal", { settle: 300 });
    }
    await context.close();
  }
} finally {
  await browser.close();
}
