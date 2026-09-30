#!/usr/bin/env node
/**
 * Drives the landing page: the Bluff demo end to end, the microphone button
 * with the permission denied, and reduced motion. One Chromium.
 *
 *   BASE_URL=http://localhost:3221 node scripts/site-drive.mjs
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const base = process.env.BASE_URL ?? "http://localhost:3221";
const out = path.join("docs", "evidence", "visual", "site", "drive");
fs.mkdirSync(out, { recursive: true });
let failed = false;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "pass" : "FAIL"} ${name}${detail ? ": " + detail : ""}`);
  if (!ok) failed = true;
};

const browser = await chromium.launch({ args: ["--use-fake-ui-for-media-stream"] });
try {
  // 1. The Bluff demo, three claims, one wrong answer.
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(base + "/", { waitUntil: "load" });
  const demo = page.locator(".al-demo");
  await demo.scrollIntoViewIfNeeded();
  check("demo shows claim 1 of 3", /Claim 1 of 3/.test(await demo.innerText()));
  await page.getByRole("button", { name: "Bluff", exact: true }).click();
  await page.waitForSelector(".al-verdict");
  const t1 = await demo.innerText();
  check("claim 1 (a bluff) answered Bluff is Caught and shows page 20", /Caught/.test(t1) && /Page 20/.test(t1) && /\+175 XP/.test(t1));
  await page.waitForTimeout(900);
  await demo.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(out, "demo-caught-390.png") });
  await page.getByRole("button", { name: "Next claim" }).click();
  await page.getByRole("button", { name: "True", exact: true }).waitFor();
  await page.getByRole("button", { name: "Bluff", exact: true }).click(); // claim 2 is true: wrong
  await page.waitForSelector(".al-verdict[data-ok='false']");
  check("claim 2 (true) answered Bluff costs a heart", /One heart lost/.test(await demo.innerText()) && (await demo.getByRole("img", { name: "2 of 3 hearts left" }).count()) === 1);
  await page.screenshot({ path: path.join(out, "demo-heart-lost-390.png") });
  await page.getByRole("button", { name: "Next claim" }).click();
  await page.getByRole("button", { name: "Bluff", exact: true }).click();
  await page.waitForSelector(".al-verdict");
  await page.getByRole("button", { name: "See the result" }).click();
  const end = await demo.innerText();
  check("result shows 2 bluffs caught and 350 XP", /2 bluffs caught/.test(end) && /350 XP/.test(end), end.replace(/\s+/g, " ").slice(0, 80));
  check("no page errors during the demo", errors.length === 0, errors.join(" | "));
  await ctx.close();

  // 2. Microphone denied: the wave keeps going and says so.
  const c2 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p2 = await c2.newPage();
  await p2.addInitScript(() => {
    window.__mic = 0;
    navigator.mediaDevices.getUserMedia = () => {
      window.__mic++;
      return Promise.reject(new DOMException("blocked", "NotAllowedError"));
    };
  });
  await p2.goto(base + "/", { waitUntil: "load" });
  await p2.waitForTimeout(1500);
  check("no microphone request before the button press", (await p2.evaluate(() => window.__mic)) === 0);
  await p2.getByRole("button", { name: /Let the wave hear you/ }).click();
  await p2.waitForFunction(() => /blocked/.test(document.querySelector(".al-stage-state")?.textContent ?? ""));
  check("denied microphone asked once and is reported in words", (await p2.evaluate(() => window.__mic)) === 1);
  await c2.close();

  // 3. Reduced motion: nothing stays hidden.
  const c3 = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const p3 = await c3.newPage();
  await p3.goto(base + "/", { waitUntil: "load" });
  await p3.waitForTimeout(500);
  const hidden = await p3.evaluate(() => [...document.querySelectorAll(".reveal")].filter((e) => getComputedStyle(e).opacity !== "1").length);
  check("reduced motion: every reveal block is fully visible without scrolling", hidden === 0, `${hidden} hidden`);
  const drift = await p3.evaluate(() => getComputedStyle(document.body, "::before").animationName);
  check("reduced motion: the colour wash does not animate", drift === "none", drift);
  await c3.close();
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
