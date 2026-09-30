#!/usr/bin/env node
/**
 * Records the Aloud demo from a REAL run and writes the raw material the renderer needs.
 *
 *   BASE_URL=http://localhost:3321 node scripts/record-demo.mjs [--mobile] [--no-render]
 *
 * Drives the real UI in Chromium (Playwright recordVideo, VP8 webm, no audio) against the real
 * AssemblyAI Voice Agent. The learner's answers are synthetic Windows System.Speech WAVs played
 * into the page through an injected getUserMedia stream (same AudioContext, worklet and socket
 * path as a microphone). The examiner's audio is captured by tapping every decoded PCM chunk the
 * page schedules for playback, with the time it was scheduled, and every playback stop (barge-in
 * flush). Nothing is re-synthesised.
 *
 * Run the dev server with DATABASE_URL blanked. Output: scripts/.tmp-demo/<mode>/
 *   raw.webm  timeline.json  examiner.wav  learner.wav
 * then scripts/render-demo.mjs turns them into docs/demo/*.
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const argv = process.argv.slice(2);
const ATTEMPTS = Number(process.env.ATTEMPTS ?? 4);
if (!argv.includes("--child")) {
  // The speech recogniser is stochastic: a take where the bluff is not caught is discarded and re-recorded whole.
  let status = 1;
  for (let a = 1; a <= ATTEMPTS; a++) {
    console.log(`attempt ${a} of ${ATTEMPTS}`);
    status = spawnSync(process.execPath, [process.argv[1], ...argv, "--child"], { stdio: "inherit" }).status ?? 1;
    if (status !== 3) break;
  }
  if (status === 0 && !argv.includes("--no-render")) status = spawnSync(process.execPath, ["scripts/render-demo.mjs", ...(argv.includes("--mobile") ? ["--mobile"] : [])], { stdio: "inherit" }).status ?? 1;
  process.exit(status);
}
const mobile = argv.includes("--mobile");
const mode = mobile ? "mobile" : "desktop";
const base = process.env.BASE_URL ?? "http://localhost:3321";
const outDir = path.resolve("scripts/.tmp-demo", mode);
const audioDir = path.resolve("fixtures/audio/live");
const size = mobile ? { width: 390, height: 844 } : { width: 1280, height: 720 };
const SAY = "l_say_c_self_attention_1";
const CATCH = "l_catch_c_self_attention_1";
const RATE = 24000;

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(path.join(outDir, "vid"), { recursive: true });

/* ---------- warm the dev server so no route compiles while the camera runs ---------- */
{
  const RUN = "run_course_transformers_w4";
  const gets = ["/", "/run/new?sample=1", `/run/${RUN}`, `/play/${SAY}?run=${RUN}`, `/play/${CATCH}?run=${RUN}`, "/me", "/api/game/progress?subjectId=course_transformers_w4", "/api/game/run?subjectId=course_transformers_w4"];
  const posts = ["/api/oral/tool", "/api/oral/session", "/api/voice-agent/token", "/api/game/progress", "/api/game/run"];
  for (const p of gets) await fetch(base + p, { signal: AbortSignal.timeout(90000) }).then((r) => r.arrayBuffer()).catch(() => {});
  for (const p of posts) await fetch(base + p, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", signal: AbortSignal.timeout(90000) }).then((r) => r.arrayBuffer()).catch(() => {});
}

/* ---------- in-page tap: decoded PCM out of every scheduled AudioBufferSource ---------- */
const tapScript = () => {
  const P = AudioBufferSourceNode.prototype;
  const origStart = P.start;
  const origStop = P.stop;
  let seq = 0;
  const b64 = (i16) => {
    const u8 = new Uint8Array(i16.buffer);
    let s = "";
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  };
  const nowEpoch = () => performance.timeOrigin + performance.now();
  P.start = function (when = 0, ...rest) {
    try {
      const c = this.context;
      const buf = this.buffer;
      if (buf) {
        const now = c.currentTime;
        const at = Math.max(when, now);
        const src = buf.getChannelData(0);
        const i16 = new Int16Array(src.length);
        for (let i = 0; i < src.length; i++) i16[i] = Math.max(-32768, Math.min(32767, Math.round(src[i] * 32767)));
        this.__id = ++seq;
        window.__tap({ kind: window.__learnerFlag ? "learner" : "examiner", id: this.__id, epochMs: nowEpoch() + (at - now) * 1000, rate: buf.sampleRate, pcm: b64(i16) });
      }
    } catch { /* tap must never break playback */ }
    return origStart.call(this, when, ...rest);
  };
  P.stop = function (when = 0) {
    try {
      if (this.__id) window.__tap({ kind: "stop", id: this.__id, epochMs: nowEpoch() + Math.max(0, when - this.context.currentTime) * 1000 });
    } catch { /* ignore */ }
    return origStop.apply(this, arguments);
  };
  // Synthetic learner: getUserMedia becomes a stream this page plays each utterance into.
  const orig = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = async (c) => {
    if (!c || !c.audio) return orig(c);
    const ac = new AudioContext();
    const dest = ac.createMediaStreamDestination();
    const silent = ac.createConstantSource();
    silent.offset.value = 0;
    silent.connect(dest);
    silent.start();
    window.__ac = ac;
    window.__dest = dest;
    return dest.stream;
  };
  window.__say = async (b) => {
    const bin = atob(b);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const buf = await window.__ac.decodeAudioData(bytes.buffer);
    const src = window.__ac.createBufferSource();
    src.buffer = buf;
    src.connect(window.__dest);
    window.__learnerFlag = true;
    src.start();
    window.__learnerFlag = false;
    return buf.duration;
  };
};

/* ---------- browser ---------- */
const browser = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"] });
const ctx = await browser.newContext({ viewport: size, recordVideo: { dir: path.join(outDir, "vid"), size }, permissions: ["microphone"], deviceScaleFactor: 1 });
const taps = [];
let examinerBusyUntil = 0;
await ctx.exposeFunction("__tap", (e) => {
  taps.push(e);
  if (e.kind === "examiner") examinerBusyUntil = Math.max(examinerBusyUntil, e.epochMs + ((e.pcm.length * 3) / 4 / 2 / e.rate) * 1000);
});
await ctx.addInitScript(tapScript);
const errors = [];
const marks = [];
const events = [];
const t0Call = Date.now();
const page = await ctx.newPage();
const videoStartEpoch = Math.round((t0Call + Date.now()) / 2);
page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 200)));
page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
const mark = (name, extra = {}) => { marks.push({ name, epochMs: Date.now(), ...extra }); console.log("mark", name, ((Date.now() - videoStartEpoch) / 1000).toFixed(1) + "s"); };
const dwell = (ms) => page.waitForTimeout(ms);

let replyDone = 0;
let toolCalls = 0;
let toolResults = 0;
let lastReplyDoneAt = 0;
page.on("websocket", (sock) => {
  if (!/assemblyai/.test(sock.url())) return;
  sock.on("framereceived", ({ payload }) => {
    let m;
    try { m = JSON.parse(String(payload)); } catch { return; }
    const e = { epochMs: Date.now(), type: m.type };
    if (m.type === "reply.audio" || m.type === "transcript.agent.delta" || m.type === "transcript.user.delta") return;
    if (m.type === "transcript.agent" || m.type === "transcript.user") { e.text = String(m.text ?? ""); if (m.interrupted) e.interrupted = true; }
    if (m.type === "reply.done") { replyDone++; lastReplyDoneAt = Date.now(); }
    if (m.type === "tool.call") { toolCalls++; e.name = m.name; e.args = m.args ?? m.arguments; }
    events.push(e);
  });
  sock.on("framesent", ({ payload }) => {
    let m;
    try { m = JSON.parse(String(payload)); } catch { return; }
    if (m.type === "tool.result") { toolResults++; events.push({ epochMs: Date.now(), type: "tool.result.sent", verdict: m.result?.verdict }); }
  });
});
page.on("response", async (res) => {
  if (!/\/api\/oral\/tool/.test(res.url())) return;
  try {
    const j = await res.json();
    const b = JSON.parse(res.request().postData() ?? "{}");
    events.push({ epochMs: Date.now(), type: "tool.http", name: b.name, status: res.status(), verdict: j.result?.verdict, page: j.result?.page, quote: j.result?.quote?.slice?.(0, 200), feedback: j.result?.feedback?.slice?.(0, 200) });
  } catch { /* ignore */ }
});

const snapFn = () => {
  const q = (s) => document.querySelector(s);
  const txt = (s) => q(s)?.textContent?.replace(/\s+/g, " ").trim() ?? null;
  return {
    phase: q('[data-testid="play-screen"]')?.getAttribute("data-phase") ?? (q('[data-testid="result"]') ? "result" : null),
    state: txt(".gx-orb-state"),
    claim: txt(".gx-claim q"),
    question: txt(".gx-prompt-text, #gx-q"),
    reveal: !!q('[aria-label="The answer"]'),
    proof: !!q('aside[aria-label="Proof card"]'),
    failure: q('[role="alert"]')?.innerText?.replace(/\s+/g, " ").slice(0, 200) ?? null,
  };
};

const wavB64 = (name) => fs.readFileSync(path.join(audioDir, `${name}.wav`)).toString("base64");
const answerSeq = { [SAY]: ["say-weight", "say-why"], [CATCH]: ["claim-real", "claim-real", "claim-bluff"] };

/** A player reads the card while the examiner talks: hold it until the voice has started and stopped (16 s for it to start, 30 s in all). */
async function quiet() {
  const shownAt = Date.now();
  while (Date.now() < shownAt + 16000 && examinerBusyUntil < shownAt) await dwell(250);
  while (Date.now() < Math.min(shownAt + 30000, examinerBusyUntil + 700)) await dwell(250);
}

async function playLevel(levelId, kind) {
  const link = page.locator(`a[href*="${levelId}"]`).first();
  await link.scrollIntoViewIfNeeded();
  mark(`map-${kind}`);
  await dwell(3200);
  mark(`tap-${kind}`);
  await link.click();
  await page.waitForSelector('[data-testid="play-screen"]', { timeout: 30000 });
  mark(`intro-${kind}`);
  await dwell(3200);
  await page.getByRole("button", { name: /Start talking/ }).click();
  mark(`start-${kind}`);

  const seq = answerSeq[levelId];
  let answered = 0;
  let lastAnswerAt = -1e9;
  const limit = Date.now() + 240000;
  let s = await page.evaluate(snapFn);
  while (Date.now() < limit && s.phase !== "result") {
    if (s.failure || s.phase === "failed" || s.phase === "lost") throw Object.assign(new Error(`level ${levelId}: ${s.failure ?? s.phase}`), { retry: s.phase === "lost" });
    if (s.reveal) { mark(`reveal-${kind}`); await dwell(3200); await quiet(); await page.getByRole("button", { name: /^Continue$/ }).click({ timeout: 2500 }).catch(() => {}); }
    else if (s.proof) { mark(`proof-${kind}`); await dwell(3800); await quiet(); await page.getByRole("button", { name: /Keep going/ }).click({ timeout: 2500 }).catch(() => {}); }
    else if (s.phase === "live" && /^Listening/.test(s.state ?? "") && replyDone > 0 && toolCalls === toolResults && Date.now() - lastReplyDoneAt > 900 && Date.now() - lastAnswerAt > 4000 && lastReplyDoneAt > lastAnswerAt) {
      const bluff = kind === "catch" && /backpropagation/i.test(s.claim ?? "");
      const name = kind === "catch" ? (bluff ? "claim-bluff" : "claim-real") : (seq[answered] ?? "say-why");
      const at = Date.now();
      const secs = await page.evaluate((b) => window.__say(b), wavB64(name));
      lastAnswerAt = at;
      answered++;
      events.push({ epochMs: at, type: "learner.utterance", wav: name, durSec: +secs.toFixed(2) });
      mark(`answer-${kind}-${answered}`, { wav: name });
    }
    await dwell(300);
    s = await page.evaluate(snapFn);
  }
  if (s.phase !== "result") throw new Error(`level ${levelId} did not finish in time`);
  mark(`result-${kind}`);
  const resultText = await page.evaluate(() => document.querySelector('[data-testid="result"]')?.innerText?.replace(/\s+/g, " ").slice(0, 300) ?? "");
  events.push({ epochMs: Date.now(), type: "result", kind, text: resultText });
  if (kind === "catch" && !/Three stars/i.test(resultText)) throw Object.assign(new Error(`bluff not caught: ${resultText.slice(0, 80)}`), { retry: true });
  await dwell(3500);
  // The XP figure counts up, so read it again once it has settled.
  const settled = await page.evaluate(() => document.querySelector('[data-testid="result"]')?.innerText?.replace(/\s+/g, " ").slice(0, 300) ?? "");
  events.push({ epochMs: Date.now(), type: "result", kind, text: settled });
  const crate = page.getByRole("button", { name: "Open the crate" });
  if (await crate.count()) { await crate.click().catch(() => {}); mark(`crate-${kind}`); }
  await dwell(5500);
  await page.getByRole("link", { name: /Back to the map/ }).click();
  await page.waitForSelector('[data-testid="run-map"]', { timeout: 30000 });
}

let failure = null;
let retry = false;
try {
  await page.goto(`${base}/`, { waitUntil: "networkidle" });
  mark("landing");
  await dwell(mobile ? 3500 : 4500);
  if (!mobile) {
    // Show the "how it works" and the bluff sections, then come back to the hero.
    for (const y of [700, 1500, 2400]) { await page.evaluate((v) => window.scrollTo({ top: v, behavior: "smooth" }), y); await dwell(1600); }
    mark("landing-scrolled");
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
    await dwell(1800);
  }
  mark("cta");
  await page.getByRole("link", { name: /Start the sample run/ }).first().click();
  await page.waitForURL(/\/run\/run_/, { timeout: 90000 });
  await page.waitForSelector('[data-testid="run-map"]', { timeout: 60000 });
  mark("map-first");
  await dwell(3500);
  await playLevel(SAY, "say");
  if (!mobile) {
    mark("map-between");
    await dwell(2000);
    await playLevel(CATCH, "catch");
    mark("map-final");
    events.push({ epochMs: Date.now(), type: "map-text", text: await page.evaluate(() => document.querySelector("main")?.innerText?.replace(/\s+/g, " ").slice(0, 400) ?? "") });
    await dwell(6000);
  } else {
    mark("map-final");
    events.push({ epochMs: Date.now(), type: "map-text", text: await page.evaluate(() => document.querySelector("main")?.innerText?.replace(/\s+/g, " ").slice(0, 400) ?? "") });
    await dwell(4500);
  }
  mark("end");
} catch (e) {
  failure = String(e).slice(0, 400);
  console.error("FAILURE", failure);
  if (e.retry) retry = true;
  await page.screenshot({ path: path.join(outDir, "failure.png") }).catch(() => {});
}
const videoEndEpoch = Date.now();
const vpath = await page.video().path();
await ctx.close();
await browser.close();
if (fs.existsSync(vpath)) fs.copyFileSync(vpath, path.join(outDir, "raw.webm"));

/* ---------- assemble the captured audio on the video timeline ---------- */
function toRate(f32, from) {
  if (from === RATE) return f32;
  const n = Math.round((f32.length * RATE) / from);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i * from) / RATE; const a = Math.floor(x); const b = Math.min(f32.length - 1, a + 1); out[i] = f32[a] + (f32[b] - f32[a]) * (x - a); }
  return out;
}
function decode(pcm64) {
  const buf = Buffer.from(pcm64, "base64");
  const i16 = new Int16Array(buf.buffer, buf.byteOffset, buf.length >> 1);
  const f = new Float32Array(i16.length);
  for (let i = 0; i < i16.length; i++) f[i] = i16[i] / 32768;
  return f;
}
function writeWav(file, f32) {
  const data = Buffer.alloc(f32.length * 2);
  for (let i = 0; i < f32.length; i++) data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(f32[i] * 32767))), i * 2);
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + data.length, 4); h.write("WAVEfmt ", 8); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(RATE, 24); h.writeUInt32LE(RATE * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write("data", 36); h.writeUInt32LE(data.length, 40);
  fs.writeFileSync(file, Buffer.concat([h, data]));
}
const stops = new Map(taps.filter((t) => t.kind === "stop").map((t) => [t.id, t.epochMs]));
const total = Math.ceil(((videoEndEpoch - videoStartEpoch) / 1000 + 2) * RATE);
const tracks = { examiner: new Float32Array(total), learner: new Float32Array(total) };
const chunkLog = [];
for (const t of taps.filter((x) => x.kind !== "stop")) {
  let f = toRate(decode(t.pcm), t.rate);
  const startSamp = Math.round(((t.epochMs - videoStartEpoch) / 1000) * RATE);
  const stopAt = stops.get(t.id);
  if (stopAt !== undefined) {
    const keep = Math.round(((stopAt - t.epochMs) / 1000) * RATE);
    if (keep < f.length) f = f.subarray(0, Math.max(0, keep));
  }
  const tr = tracks[t.kind];
  for (let i = 0; i < f.length; i++) { const k = startSamp + i; if (k >= 0 && k < total) tr[k] = Math.max(-1, Math.min(1, tr[k] + f[i])); }
  chunkLog.push({ kind: t.kind, tSec: +((t.epochMs - videoStartEpoch) / 1000).toFixed(3), sec: +(f.length / RATE).toFixed(3), cut: stopAt !== undefined && Math.round(((stopAt - t.epochMs) / 1000) * RATE) < decode(t.pcm).length });
}
writeWav(path.join(outDir, "examiner.wav"), tracks.examiner);
writeWav(path.join(outDir, "learner.wav"), tracks.learner);
const sum = (k) => +chunkLog.filter((c) => c.kind === k).reduce((a, c) => a + c.sec, 0).toFixed(2);
const timeline = { mode, base, recordedOn: new Date(videoStartEpoch).toISOString(), videoStartEpoch, videoEndEpoch, wallSec: +((videoEndEpoch - videoStartEpoch) / 1000).toFixed(2), viewport: size, chromium: browser.version?.() ?? null, marks, events, chunkLog: chunkLog.filter((c) => c.cut), examinerSec: sum("examiner"), learnerSec: sum("learner"), errors, failure };
fs.writeFileSync(path.join(outDir, "timeline.json"), JSON.stringify(timeline, null, 1) + "\n", "utf8");
console.log("recorded", mode, "wall", timeline.wallSec, "s | examiner audio", timeline.examinerSec, "s | learner audio", timeline.learnerSec, "s | flushed chunks", timeline.chunkLog.length, "| failure:", failure ?? "none", "| console errors:", errors.length);
process.exit(failure ? (retry ? 3 : 1) : 0);
