#!/usr/bin/env node
/** Failure and access states of the game screens, one Chromium. BASE_URL=http://localhost:3241 node scripts/states-play.mjs */
import { chromium } from "@playwright/test";
import fs from "node:fs";
const base = process.env.BASE_URL ?? "http://localhost:3241";
const RUN = "run_course_transformers_w4";
const out = "docs/evidence/visual/play";
fs.mkdirSync(out, { recursive: true });
const log = (o) => console.log(JSON.stringify(o));
const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException("denied", "NotAllowedError"));
  });
  await page.goto(`${base}/run/new?sample=1`, { waitUntil: "networkidle" });
  await page.waitForURL(/\/run\/run_/, { timeout: 60000 });
  const run = await page.evaluate((id) => JSON.parse(localStorage.getItem(`aloud.run.${id}`)), RUN);

  // Mic denied: the explanation and the typed way forward.
  await page.goto(`${base}/play/${run.levels[0].id}?run=${RUN}`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Start talking/ }).click();
  await page.getByText("Voice is not available").waitFor({ timeout: 30000 });
  log({ state: "mic-denied", text: (await page.locator('[role="alert"]').first().innerText()).replace(/\s+/g, " ").slice(0, 260) });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/state-mic-denied-390.png` });
  await page.getByRole("button", { name: /Play by typing/ }).click();
  await page.waitForSelector('[data-phase="live"]');
  log({ state: "typed-after-denied", live: true });

  // Keyboard only: type an answer and send it with Ctrl+Enter, focus lands in the box.
  const focused = await page.evaluate(() => document.activeElement?.tagName);
  await page.keyboard.type("Self-attention is permutation-equivariant so it cannot see order without positional information.");
  await page.keyboard.press("Control+Enter");
  await page.waitForFunction(() => document.querySelectorAll(".gx-rounds i.done, .gx-rounds i.miss").length > 0, null, { timeout: 45000 });
  log({ state: "keyboard-only", focusedTagAtRoundStart: focused, roundResolved: true });

  // Reduced motion: no animation names on the wash or the node pulse.
  await page.goto(`${base}/run/${RUN}`, { waitUntil: "networkidle" });
  const anim = await page.evaluate(() => [...document.querySelectorAll(".gx-wash i, .gx-node-pulse")].map((e) => getComputedStyle(e).animationName).filter((n) => n !== "none").length);
  log({ state: "reduced-motion", runningAnimations: anim });

  // Offline: the map opens from the copy kept in the browser and says so.
  await page.goto(`${base}/run/${RUN}`, { waitUntil: "networkidle" });
  await ctx.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" }).catch(() => null);
  await page.waitForTimeout(500);
  await ctx.setOffline(false);
  await ctx.close();

  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p2 = await ctx2.newPage();
  await p2.goto(`${base}/run/new?sample=1`, { waitUntil: "networkidle" });
  await p2.waitForURL(/\/run\/run_/, { timeout: 60000 });
  await p2.waitForSelector('[data-testid="run-map"]');
  await p2.route("**/api/game/**", (r) => r.abort());
  await ctx2.setOffline(true);
  await p2.evaluate(() => window.dispatchEvent(new Event("offline")));
  await p2.goto(`${base}/run/${RUN}`).catch(() => null);
  await ctx2.setOffline(false);
  await p2.goto(`${base}/run/${RUN}`, { waitUntil: "networkidle" });
  await p2.route("**/api/game/run**", (r) => r.abort());
  await p2.reload({ waitUntil: "networkidle" });
  await p2.waitForSelector('[data-testid="run-map"]', { timeout: 20000 });
  log({ state: "api-down-map-from-kept-copy", banner: await p2.locator(".gx-banner-offline").count(), map: true });
  await p2.screenshot({ path: `${out}/state-offline-390.png` });
  await ctx2.close();

  // Empty: no run yet.
  const ctx3 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p3 = await ctx3.newPage();
  await p3.goto(`${base}/me`, { waitUntil: "networkidle" });
  await p3.getByText("No run yet").waitFor();
  await p3.screenshot({ path: `${out}/state-empty-390.png` });
  log({ state: "empty-profile", ok: true });
  await ctx3.close();
} finally {
  await browser.close();
}
