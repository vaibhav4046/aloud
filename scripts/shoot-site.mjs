#!/usr/bin/env node
/**
 * Marketing-page screenshots, one Chromium, one page at a time.
 *
 *   BASE_URL=http://localhost:3221 node scripts/shoot-site.mjs --pass 1
 *   node scripts/shoot-site.mjs --pass 2 --paths / /about --widths 390,1440
 *
 * For each path and width it scrolls the whole page in steps (so scroll reveals
 * fire), saves a first-viewport PNG and a full-page PNG to
 * docs/evidence/visual/site/pass<N>/, and prints overflow and console errors.
 * Exit code 1 on horizontal overflow or a console error.
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const value = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : dflt;
};
const pass = value("--pass", "1");
const widths = value("--widths", "390,768,1440").split(",").map(Number);
const pathsAt = args.indexOf("--paths");
const paths = pathsAt >= 0 ? args.slice(pathsAt + 1).filter((a) => !a.startsWith("--")).map((a) => (a.startsWith("/") ? a : "/" + a)) : ["/"];
const base = process.env.BASE_URL ?? "http://localhost:3221";
const out = path.join("docs", "evidence", "visual", "site", `pass${pass}`);
fs.mkdirSync(out, { recursive: true });

const heightFor = (w) => (w < 600 ? 844 : w < 1000 ? 1024 : 900);
const slug = (p) => (p === "/" ? "landing" : p.replace(/^\//, "").replace(/\W+/g, "-"));

const browser = await chromium.launch();
let bad = 0;
try {
  for (const p of paths) {
    for (const w of widths) {
      const ctx = await browser.newContext({ viewport: { width: w, height: heightFor(w) }, deviceScaleFactor: 1, hasTouch: w < 600 });
      const page = await ctx.newPage();
      const errors = [];
      page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 200)));
      page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
      const T0 = Date.now();
      const step = (m) => process.env.SHOOT_TRACE && console.log(`  ${m} +${Date.now() - T0}ms`);
      await page.goto(base + p, { waitUntil: "load", timeout: 90000 });
      step("loaded");
      await page.waitForTimeout(1600);
      const name = `${slug(p)}-${w}`;
      await page.screenshot({ path: path.join(out, `${name}-fold.png`) });
      step("fold shot");
      const total = await page.evaluate(() => document.documentElement.scrollHeight);
      for (let y = 0; y < total; y += Math.round(heightFor(w) * 0.6)) {
        await page.evaluate((top) => window.scrollTo(0, top), y);
        await page.waitForTimeout(140);
      }
      await page.waitForTimeout(900);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(300);
      step("scrolled");
      await page.screenshot({ path: path.join(out, `${name}-full.png`), fullPage: true });
      step("full shot");
      const sliceH = w < 600 ? 1100 : 1000;
      const th = await page.evaluate(() => document.documentElement.scrollHeight);
      for (let k = 0, y = 0; y < th; k++, y += sliceH) {
        await page.screenshot({ path: path.join(out, `${name}-s${String(k + 1).padStart(2, '0')}.png`), fullPage: true, clip: { x: 0, y, width: w, height: Math.min(sliceH, th - y) } });
      }
      const m = await page.evaluate(() => ({
        sw: document.documentElement.scrollWidth,
        cw: document.documentElement.clientWidth,
        h: document.documentElement.scrollHeight,
      }));
      const overflow = m.sw > m.cw;
      if (overflow || errors.length) bad++;
      console.log(`${name}: height ${m.h}px, overflow ${overflow ? `YES (${m.sw}>${m.cw})` : "no"}, console errors ${errors.length}${errors.length ? " " + JSON.stringify(errors) : ""}`);
      await ctx.close();
    }
  }
} finally {
  await browser.close();
}
process.exit(bad ? 1 : 0);
