#!/usr/bin/env node
/**
 * Drives one Aloud level through the real UI in Chromium against the real
 * AssemblyAI Voice Agent service and the real tool route. The microphone is
 * Chromium's fake device playing a SYNTHETIC learner voice (Windows
 * System.Speech, fixtures/audio/live). Nothing is mocked.
 *
 *   BASE_URL=http://localhost:3261 node scripts/probes/aloud-live-drive.mjs <scenario> [--tag x]
 *
 * scenarios: calibrate | say | catch | bargein | typed-say | typed-catch | boss | recall
 *            boss: World 1 boss (catch, say, catch, say), spoken. recall: level 2 (Catch) is played by typing with one
 *            deliberate wrong call, then the run must serve a recall level, which is played by voice.
 * Options:   --greet <sec>  click-to-end-of-greeting, from a calibrate run (default 14)
 *            --gap <sec>    silence between spoken answers (default 40)
 *            --level <id>   override the level id
 *            --inject       event-driven answers: the page's getUserMedia is replaced by a stream the driver
 *                           plays each synthetic utterance into once the examiner has finished and is listening.
 *                           Same AudioContext, worklet and socket path as a real microphone.
 *
 * Output: docs/evidence/probes/aloud-<scenario><tag>.<date>.json with the timeline
 * of socket events, tool HTTP calls and screen snapshots, plus derived checks.
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const argv = process.argv.slice(2);
const scenario = argv[0];
const opt = (n, d) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);
const base = process.env.BASE_URL ?? "http://localhost:3261";
const tag = opt("--tag", "");
const greetSec = Number(opt("--greet", 14));
const gapSec = Number(opt("--gap", 40));
const RUN_ID = "run_course_transformers_w4";
const LEVELS = { say: "l_say_c_self_attention_1", catch: "l_catch_c_self_attention_1", bargein: "l_say_c_self_attention_1", "bargein-say": "l_say_c_self_attention_1", calibrate: "l_say_c_self_attention_1", "typed-say": "l_say_c_self_attention_1", "typed-catch": "l_catch_c_self_attention_1", boss: "l_boss_1", recall: "l_say_c_self_attention_1" };
let levelId = opt("--level", LEVELS[scenario]);
const audioDir = "fixtures/audio/live";
const date = new Date().toISOString().slice(0, 10);
const outFile = `docs/evidence/probes/aloud-${scenario}${tag}.${date}.json`;
const shotDir = `docs/evidence/visual/${date}`;
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.mkdirSync(shotDir, { recursive: true });

/* ---------- audio composition: one padded WAV the fake device plays once ---------- */
function readWav(file) {
  const b = fs.readFileSync(file);
  const fmt = b.indexOf("fmt ");
  const data = b.indexOf("data");
  return { rate: b.readUInt32LE(fmt + 12), ch: b.readUInt16LE(fmt + 10), bits: b.readUInt16LE(fmt + 22), pcm: b.subarray(data + 8, data + 8 + b.readUInt32LE(data + 4)), head: b.subarray(0, data + 8), dataAt: data };
}
function compose(segments, totalSec, outPath) {
  const first = readWav(`${audioDir}/interrupt.wav`);
  const bps = first.ch * (first.bits / 8);
  const total = Math.round(totalSec * first.rate) * bps;
  const pcm = Buffer.alloc(total);
  const placed = [];
  for (const s of segments) {
    const w = readWav(`${audioDir}/${s.wav}.wav`);
    const off = Math.round(s.at * first.rate) * bps;
    w.pcm.copy(pcm, off, 0, Math.min(w.pcm.length, total - off));
    placed.push({ wav: s.wav, atSec: s.at, durSec: +(w.pcm.length / bps / first.rate).toFixed(2) });
  }
  const head = Buffer.from(first.head);
  head.writeUInt32LE(4 + (first.dataAt - 12) + 8 + pcm.length, 4);
  head.writeUInt32LE(pcm.length, first.dataAt + 4);
  fs.writeFileSync(outPath, Buffer.concat([head, pcm]));
  return placed;
}
const dur = (w) => { const x = readWav(`${audioDir}/${w}.wav`); return x.pcm.length / (x.ch * x.bits / 8) / x.rate; };

let plan = [];
let totalSec = 30;
if (scenario === "calibrate") { plan = []; totalSec = 60; }
if (scenario === "say") {
  const a = greetSec + 3;
  const b = a + dur("say-weight") + gapSec;
  plan = [{ wav: "say-weight", at: a }, { wav: "say-why", at: b }];
  totalSec = b + dur("say-why") + 20;
}
if (scenario === "catch") {
  const a = greetSec + 3;
  const b = a + dur("claim-real") + gapSec;
  const c = b + dur("claim-real") + gapSec + 8;
  plan = [{ wav: "claim-real", at: a }, { wav: "claim-real", at: b }, { wav: "claim-bluff", at: c }];
  totalSec = c + dur("claim-bluff") + 25;
}
if (scenario === "bargein") {
  // The learner cuts in while the examiner is still reading the greeting.
  plan = [{ wav: "interrupt", at: Number(opt("--at", 6)) }];
  totalSec = 60;
}
const voice = !scenario.startsWith("typed");
const inject = argv.includes("--inject") || scenario === "bargein-say";
const limitSec = Number(opt("--limit", 240));
let answered = 0;
let lastAnswerAt = -1e9;
const ANSWERS = { "bargein-say": ["interrupt", "say-weight", "say-why"], say: ["say-weight", "say-why"], catch: ["claim-real", "claim-real", "claim-bluff"], boss: ["boss-bluff", "boss-qkv", "claim-real", "say-weight"], recall: ["say-weight", "say-why"] }[scenario] ?? [];
let fakeArgs = [];
if (voice && !inject) {
  const wavPath = path.join(os.tmpdir(), `aloud-live-${scenario}.wav`);
  plan = compose(plan, totalSec, wavPath);
  fakeArgs = [`--use-file-for-fake-audio-capture=${wavPath}%noloop`];
}

/* ---------- browser ---------- */
const browser = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required", ...fakeArgs] });
const ctx = await browser.newContext({ viewport: { width: 430, height: 900 }, permissions: ["microphone"] });
const page = await ctx.newPage();
if (inject) {
  await page.addInitScript(() => {
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
    window.__say = async (b64) => {
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const buf = await window.__ac.decodeAudioData(bytes.buffer);
      const src = window.__ac.createBufferSource();
      src.buffer = buf;
      src.connect(window.__dest);
      src.start();
      return buf.duration;
    };
  });
}
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 200)));
page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));

let t0 = 0;
const T = () => Date.now() - t0;
const ws = [];
const http = [];
const dom = [];
const deltas = [];
let audioBytes = 0;
let audioFrames = 0;
page.on("websocket", (sock) => {
  if (!/assemblyai/.test(sock.url())) return;
  sock.on("framereceived", ({ payload }) => {
    let m;
    try { m = JSON.parse(String(payload)); } catch { return; }
    const t = T();
    if (m.type === "reply.audio") {
      const bytes = Math.floor((String(m.data ?? "").length * 3) / 4);
      audioFrames++;
      audioBytes += bytes;
      // One entry per burst of frames: first and last arrival, frame count, bytes.
      const prev = ws.at(-1);
      if (prev?.type === "reply.audio") { prev.last = t; prev.n += 1; prev.bytes += bytes; } else ws.push({ t, dir: "in", type: "reply.audio", last: t, n: 1, bytes });
      return;
    }
    const e = { t, dir: "in", type: m.type };
    if (m.type === "transcript.user" || m.type === "transcript.agent") { e.text = String(m.text ?? "").slice(0, 400); if (m.interrupted) e.interrupted = true; }
    if (m.type === "reply.done") e.status = m.status;
    if (m.type === "tool.call") { e.name = m.name; e.call_id = m.call_id; e.args = m.args ?? m.arguments; }
    if (m.type === "session.ready") e.session_id = String(m.session_id ?? "").slice(0, 8);
    if (m.type === "session.error" || m.type === "session.ended") e.detail = JSON.stringify(m).slice(0, 200);
    if (m.type === "transcript.agent.delta") { deltas.push([t, String(m.reply_id ?? "").slice(-6), m.delta]); return; }
    if (m.type === "transcript.user.delta") return;
    ws.push(e);
  });
  sock.on("framesent", ({ payload }) => {
    let m;
    try { m = JSON.parse(String(payload)); } catch { return; }
    if (m.type === "input.audio") { if (!ws.some((x) => x.type === "input.audio.first")) ws.push({ t: T(), dir: "out", type: "input.audio.first" }); return; }
    const e = { t: T(), dir: "out", type: m.type };
    if (m.type === "tool.result") {
      // The service takes the result as a JSON string; read it back so the round state the game reported is on record.
      let r = m.result;
      if (typeof r === "string") { try { r = JSON.parse(r); } catch { r = {}; } }
      e.call_id = m.call_id; e.is_error = m.is_error; e.verdict = r?.verdict; e.round = r?.round; e.keys = Object.keys(r ?? {});
    }
    ws.push(e);
  });
});
const pending = new Map();
page.on("request", (r) => {
  if (!/\/api\/oral\/tool|\/api\/game\/progress|\/api\/oral\/session|\/api\/voice-agent\/token/.test(r.url())) return;
  pending.set(r, { t: T(), url: new URL(r.url()).pathname, method: r.method(), body: r.method() === "POST" ? r.postData()?.slice(0, 500) : undefined });
});
page.on("response", async (res) => {
  const req = res.request();
  const p = pending.get(req);
  if (!p) return;
  pending.delete(req);
  const e = { ...p, status: res.status(), ms: T() - p.t };
  if (/oral\/tool/.test(p.url)) {
    try { const j = await res.json(); e.result = { verdict: j.result?.verdict, quote: j.result?.quote?.slice?.(0, 160), page: j.result?.page, passage_id: j.result?.passage_id, next_focus: !!j.result?.next_focus, feedback: j.result?.feedback?.slice?.(0, 160) }; } catch { /* ignore */ }
    try { const b = JSON.parse(p.body); e.name = b.name; e.levelId = b.levelId; e.args = b.arguments; delete e.body; } catch { /* ignore */ }
  }
  if (res.status() >= 400) e.errorBody = (await res.text().catch(() => "")).slice(0, 400);
  else if (/game\/progress/.test(p.url)) delete e.body;
  http.push(e);
});

const snapFn = () => {
  const q = (s) => document.querySelector(s);
  const txt = (s) => q(s)?.textContent?.replace(/\s+/g, " ").trim() ?? null;
  return {
    phase: q('[data-testid="play-screen"]')?.getAttribute("data-phase") ?? (q('[data-testid="result"]') ? "result" : null),
    hearts: q(".gx-hearts")?.getAttribute("aria-label") ?? null,
    round: q(".gx-rounds")?.getAttribute("aria-label") ?? null,
    combo: q(".gx-combo")?.getAttribute("aria-label") ?? null,
    xp: [...document.querySelectorAll(".gx-meta .gx-chip")].map((n) => n.textContent).find((t) => /XP/.test(t ?? "")) ?? null,
    state: txt(".gx-orb-state"),
    claim: txt(".gx-claim q"),
    question: txt(".gx-prompt-text, #gx-q"),
    examiner: txt(".gx-caps p:not(.you)"),
    examinerCut: !!q(".gx-caps p.cut"),
    you: txt(".gx-caps p.you:has(.gx-eyebrow)"),
    reveal: q('[aria-label="The answer"]')?.innerText?.replace(/\s+/g, " ").slice(0, 400) ?? null,
    proof: q('aside[aria-label="Proof card"]')?.innerText?.replace(/\s+/g, " ").slice(0, 400) ?? null,
    toast: txt(".gx-toast"),
    result: q('[data-testid="result"]')?.innerText?.replace(/\s+/g, " ").slice(0, 500) ?? null,
    failure: q('[role="alert"]')?.innerText?.replace(/\s+/g, " ").slice(0, 200) ?? null,
  };
};

const doc = { scenario, tag, measuredOn: new Date().toISOString(), node: process.version, chromium: null, base, levelId, learnerVoice: "synthetic (Windows System.Speech)", plan, greetSecAssumed: greetSec, gapSec, ws, http, dom, agentDeltas: deltas, errors };
let failure = null;
try {
  doc.chromium = browser.version();
  await page.goto(`${base}/run/new`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Use the sample/ }).click();
  await page.waitForURL(/\/run\/run_/, { timeout: 90000 });
  await page.waitForSelector('[data-testid="run-map"]');
  await page.waitForFunction((id) => localStorage.getItem(`aloud.progress.${id}`), RUN_ID, { timeout: 20000 }).catch(() => {});
  if (scenario === "recall") await servedRecall();
  // Levels unlock in order. When the level under test is locked, mark the levels before it cleared, written the way the app writes it.
  const run = scenario === "recall"
    ? await page.evaluate(async () => (await (await fetch("/api/game/run?subjectId=course_transformers_w4", { cache: "no-store" })).json()).run)
    : await page.evaluate((id) => JSON.parse(localStorage.getItem(`aloud.run.${id}`)), RUN_ID);
  const lvl = run.levels.find((l) => l.id === levelId);
  if (lvl.index > 1) {
    const had = await page.evaluate((id) => Object.keys(JSON.parse(localStorage.getItem(`aloud.progress.${id}`))?.results ?? {}), RUN_ID);
    const seeded = JSON.parse(execFileSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "scripts/probes/aloud-seed.mts"], { input: JSON.stringify({ run, upto: lvl.index, skip: had }), maxBuffer: 1 << 24 }).toString("utf8"));
    doc.seededLevels = seeded.map((r) => ({ id: r.levelId, stars: r.stars, xp: r.xp }));
    await page.evaluate(({ run, seeded, upto }) => {
      const key = `aloud.progress.${run.id}`;
      const p = JSON.parse(localStorage.getItem(key));
      for (const r of seeded) p.results[r.levelId] = r;
      p.unlockedIndex = Math.max(p.unlockedIndex ?? 1, upto);
      localStorage.setItem(key, JSON.stringify(p));
      // The server checks that a finished level was unlocked, so it must hold the same earlier results.
      return fetch("/api/game/progress", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subjectId: run.subjectId, progress: p, tz: "UTC" }) }).then((r) => r.status);
    }, { run, seeded, upto: lvl.index }).then((st) => (doc.seedStatus = st));
    doc.serverAfterSeed = await page.evaluate(async () => { const j = await (await fetch("/api/game/progress?subjectId=course_transformers_w4", { cache: "no-store" })).json(); return { results: Object.keys(j.progress.results).length, unlockedIndex: j.progress.unlockedIndex, xp: j.progress.xp }; });
  }
  await page.goto(`${base}/play/${encodeURIComponent(levelId)}?run=${RUN_ID}`, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-testid="play-screen"]', { timeout: 30000 });
  await page.screenshot({ path: `${shotDir}/live-${scenario}${tag}-intro-430.png` });

  // Poll the screen; record a snapshot whenever it changes.
  let last = "";
  let stop = false;
  const poller = (async () => {
    while (!stop) {
      const s = await page.evaluate(snapFn).catch(() => null);
      if (s) { const k = JSON.stringify(s); if (k !== last) { last = k; dom.push({ t: T(), ...s }); } }
      await new Promise((r) => setTimeout(r, 200));
    }
  })();

  t0 = Date.now();
  if (voice) await page.getByRole("button", { name: /Start talking/ }).click();
  else await page.getByRole("button", { name: /Play by typing/ }).click();
  doc.clickAt = t0;

  const limitMs = (voice && !inject ? totalSec + 30 : limitSec) * 1000;
  const isDone = () => dom.at(-1)?.phase === "result";
  let shots = 0;
  while (T() < limitMs && !isDone()) {
    const s = dom.at(-1);
    if (voice && scenario === "calibrate" && ws.some((e) => e.type === "reply.done")) break;
    if (voice && scenario === "bargein" && ws.some((e) => e.type === "transcript.agent" && e.interrupted) && ws.filter((e) => e.type === "reply.done").length >= 2) { await page.waitForTimeout(6000); break; }
    // A player taps Continue on the answer card and Keep going on the proof card.
    if (s?.reveal) { await page.waitForTimeout(1500); await page.screenshot({ path: `${shotDir}/live-${scenario}${tag}-reveal-${++shots}-430.png` }).catch(() => {}); doc.revealClicks = (doc.revealClicks ?? 0) + 1; await page.getByRole("button", { name: /^Continue$/ }).click({ timeout: 2000 }).catch(() => {}); }
    if (s?.proof) { await page.waitForTimeout(1200); await page.screenshot({ path: `${shotDir}/live-${scenario}${tag}-proof-${++shots}-430.png` }).catch(() => {}); await page.getByRole("button", { name: /Keep going/ }).click({ timeout: 2000 }).catch(() => {}); }
    if (voice && inject) await injectStep(s);
    if (!voice) await typedStep(page, s);
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${shotDir}/live-${scenario}${tag}-end-430.png`, fullPage: true }).catch(() => {});
  stop = true;
  await poller;
  doc.localProgress = await page.evaluate((id) => { try { const p = JSON.parse(localStorage.getItem(`aloud.progress.${id}`)); return { xp: p.xp, rank: p.rank, unlockedIndex: p.unlockedIndex, results: Object.fromEntries(Object.entries(p.results).filter(([, r]) => r.rounds.length).map(([k, r]) => [k, { stars: r.stars, xp: r.xp, heartsLeft: r.heartsLeft, rounds: r.rounds, outcome: r.outcome, proofIds: r.proofIds }])), proofs: p.proofs.map((x) => ({ quote: x.quote.slice(0, 120), page: x.page, passageId: x.passageId })) }; } catch { return null; } }, RUN_ID);
  // Streak and daily ring: read what the app itself shows on the profile and map after the level, and what the server holds.
  if (isDone()) {
    doc.localStreak = await page.evaluate((id) => { const p = JSON.parse(localStorage.getItem(`aloud.progress.${id}`)); return { streakDays: p.streakDays, lastPlayedDay: p.lastPlayedDay, freezes: p.freezes, todayMinutes: p.todayMinutes, todayDay: p.todayDay, dailyGoalMinutes: p.dailyGoalMinutes, weakConceptIds: p.weakConceptIds }; }, RUN_ID);
    doc.serverProgress = await page.evaluate(async () => { const r = await fetch("/api/game/progress?subjectId=course_transformers_w4", { cache: "no-store" }); const j = await r.json(); const p = j.progress; return { status: r.status, persisted: j.persisted, xp: p.xp, rank: p.rank, streakDays: p.streakDays, lastPlayedDay: p.lastPlayedDay, todayMinutes: p.todayMinutes, results: Object.keys(p.results).length, proofs: p.proofs.length }; });
    await page.goto(`${base}/me`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    doc.profileText = await page.evaluate(() => document.querySelector("main")?.innerText?.replace(/\s+/g, " ").slice(0, 700) ?? null);
    await page.screenshot({ path: `${shotDir}/live-${scenario}${tag}-profile-430.png`, fullPage: true }).catch(() => {});
    await page.goto(`${base}/run/${RUN_ID}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    doc.mapText = await page.evaluate(() => document.querySelector('[data-testid="run-map"]')?.innerText?.replace(/\s+/g, " ").slice(0, 500) ?? null);
    await page.screenshot({ path: `${shotDir}/live-${scenario}${tag}-map-430.png` }).catch(() => {});
  }
} catch (e) {
  failure = String(e).slice(0, 400);
  await page.screenshot({ path: `${shotDir}/live-${scenario}${tag}-failure-430.png` }).catch(() => {});
} finally {
  await browser.close();
}
doc.failure = failure;
doc.audioFrames = audioFrames;
doc.audioBytes = audioBytes;
doc.examinerAudioSec = +(audioBytes / 2 / 24000).toFixed(2);
fs.writeFileSync(outFile, JSON.stringify(doc, null, 1) + "\n", "utf8");

/* ---------- summary to stdout ---------- */
const at = (type, n = 0) => ws.filter((e) => e.type === type)[n]?.t ?? null;
console.log("scenario", scenario, "level", levelId, "failure:", failure ?? "none", "console errors:", errors.length);
console.log("session.ready ms", at("session.ready"), "| first reply.audio ms", at("reply.audio"), "| first reply.done ms", at("reply.done"), "| examiner audio sec", doc.examinerAudioSec);
console.log("agent turns:", ws.filter((e) => e.type === "transcript.agent").length, "| user turns:", ws.filter((e) => e.type === "transcript.user").length, "| tool.call:", ws.filter((e) => e.type === "tool.call").map((e) => e.name).join(","), "| tool.result sent:", ws.filter((e) => e.type === "tool.result").length);
console.log("last phase:", dom.at(-1)?.phase, "| hearts:", dom.at(-1)?.hearts, "| out:", outFile);

/* ---------- injected spoken answers, event-driven ---------- */
async function injectStep(s) {
  if (answered >= ANSWERS.length || s?.phase !== "live") return;
  if (scenario === "bargein-say" && answered === 0) {
    // Cut in while the examiner is still reading the opening question.
    if (!/^Speaking/.test(s.state ?? "") || T() < Number(opt("--at", 2000))) return;
    const at = T();
    const secs = await page.evaluate((b) => window.__say(b), fs.readFileSync(`${audioDir}/interrupt.wav`).toString("base64"));
    lastAnswerAt = at;
    answered = 1;
    (doc.injected ??= []).push({ wav: "interrupt", atMs: at, durSec: +secs.toFixed(2), whileExaminerSpeaking: true });
    return;
  }
  if (!/^Listening/.test(s.state ?? "")) return;
  const lastDone = ws.filter((e) => e.type === "reply.done").at(-1);
  const calls = ws.filter((e) => e.type === "tool.call").length;
  const results = ws.filter((e) => e.type === "tool.result").length;
  if (!lastDone || calls !== results) return;
  if (T() - lastDone.t < 900 || T() - lastAnswerAt < 4000 || lastDone.t < lastAnswerAt) return;
  // After an answer, wait for the examiner to actually speak (its next question or reaction). An empty reply.done does not count;
  // if it stays silent for 25 s the answer is repeated and the repeat is recorded.
  const spokeSince = ws.some((e) => e.type === "transcript.agent" && e.t > lastAnswerAt);
  if (answered > 0 && !spokeSince && T() - lastAnswerAt < 25000) return;
  const name = ANSWERS[answered];
  const b64 = fs.readFileSync(`${audioDir}/${name}.wav`).toString("base64");
  const at = T();
  const secs = await page.evaluate((b) => window.__say(b), b64);
  lastAnswerAt = at;
  answered += 1;
  (doc.injected ??= []).push({ wav: name, atMs: at, durSec: +secs.toFixed(2), afterReplyDoneMs: at - lastDone.t });
}

/* ---------- typed play (same UI, the real grader) ---------- */
async function typedStep(page, s) {
  if (!s || s.phase !== "live" || s.reveal || s.proof) return;
  if (s.claim) {
    const idx = doc.__typedCatch ?? 0;
    // Catch it on the planted claim (the third), otherwise confirm it is true.
    const isBluffRound = /backpropagation/.test(s.claim);
    const name = isBluffRound ? /Catch it/ : /That is true/;
    if (doc.__lastClaim === s.claim) return;
    doc.__lastClaim = s.claim;
    doc.__typedCatch = idx + 1;
    const t = T();
    await page.getByRole("button", { name }).first().click({ timeout: 4000 }).catch(() => {});
    doc.typedCatch = [...(doc.typedCatch ?? []), { claim: s.claim.slice(0, 80), tapped: isBluffRound ? "bluff" : "real", tapAt: t }];
    return;
  }
  if (s.question && doc.__lastQ !== s.question) {
    const answers = {
      "say what an attention weight means": "An attention weight says how much one token listens to another token before the value vectors are averaged.",
      "Why does Self-attention matter": "Without self attention a token could not compare itself with every other token, so the model would lose context across the sequence.",
    };
    const key = Object.keys(answers).find((k) => s.question.includes(k));
    if (!key) return;
    doc.__lastQ = s.question;
    const t = T();
    await page.getByLabel("Your answer").fill(answers[key]);
    await page.getByRole("button", { name: /Check my answer/ }).click({ timeout: 4000 }).catch(() => {});
    doc.typedSay = [...(doc.typedSay ?? []), { q: s.question.slice(0, 80), submitAt: t }];
  }
}

/* ---------- recall: a real miss on level 1, typed, then the run must serve a recall level ---------- */
async function servedRecall() {
  // Level 1 is seeded as cleared (server-valid), then Catch level 2 is played by typing with ONE deliberate wrong call on
  // its last claim: a won level with a miss, so the missed concept goes on the weak list and the run must serve a recall level.
  const run0 = await page.evaluate(async () => (await (await fetch("/api/game/run?subjectId=course_transformers_w4", { cache: "no-store" })).json()).run);
  const seed0 = JSON.parse(execFileSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "scripts/probes/aloud-seed.mts"], { input: JSON.stringify({ run: run0, upto: 2 }), maxBuffer: 1 << 24 }).toString("utf8"));
  await page.evaluate(({ run, seeded }) => {
    const key = `aloud.progress.${run.id}`;
    const p = JSON.parse(localStorage.getItem(key));
    for (const r of seeded) p.results[r.levelId] = r;
    p.unlockedIndex = Math.max(p.unlockedIndex ?? 1, 2);
    localStorage.setItem(key, JSON.stringify(p));
    return fetch("/api/game/progress", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subjectId: run.subjectId, progress: p, tz: "UTC" }) }).then((r) => r.status);
  }, { run: run0, seeded: seed0 });
  const missId = "l_catch_c_self_attention_1";
  const truth = new Map(run0.levels.find((l) => l.id === missId).items.map((i) => [i.claim, i.isBluff]));
  await page.goto(`${base}/play/${encodeURIComponent(missId)}?run=${RUN_ID}`, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-testid="play-screen"]', { timeout: 30000 });
  await page.getByRole("button", { name: /Play by typing/ }).click();
  const started = Date.now();
  let asked = 0;
  let lastClaim = null;
  const prior = { taps: [] };
  while (Date.now() - started < 150000) {
    const s = await page.evaluate(snapFn);
    if (s.phase === "result") break;
    if (s.reveal) await page.getByRole("button", { name: /^Continue$/ }).click({ timeout: 2000 }).catch(() => {});
    else if (s.proof) await page.getByRole("button", { name: /Keep going/ }).click({ timeout: 2000 }).catch(() => {});
    else if (s.phase === "live" && s.claim && s.claim !== lastClaim) {
      lastClaim = s.claim;
      const bluff = truth.get(s.claim.replace(/\s+/g, " ").trim());
      const last = asked === truth.size - 1; // the miss is the last claim, so a later success on the same concept does not cancel it
      const callBluff = last ? !bluff : bluff;
      await page.getByRole("button", { name: callBluff ? /Catch it/ : /That is true/ }).first().click({ timeout: 4000 }).catch(() => {});
      prior.taps.push({ round: asked + 1, isBluff: bluff ?? null, tapped: callBluff ? "bluff" : "real", deliberateMiss: last });
      asked += 1;
    }
    await page.waitForTimeout(400);
  }
  await page.waitForTimeout(1500);
  const after = await page.evaluate((id) => { const p = JSON.parse(localStorage.getItem(`aloud.progress.${id}`)); return { weakConceptIds: p.weakConceptIds, level2: p.results["l_catch_c_self_attention_1"] ? { stars: p.results["l_catch_c_self_attention_1"].stars, rounds: p.results["l_catch_c_self_attention_1"].rounds, heartsLeft: p.results["l_catch_c_self_attention_1"].heartsLeft, missed: p.results["l_catch_c_self_attention_1"].missedConceptIds } : null }; }, RUN_ID);
  await page.goto(`${base}/run/${RUN_ID}`, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-testid="run-map"]');
  await page.waitForTimeout(1500);
  const served = await page.evaluate(async (id) => {
    const r = await fetch("/api/game/run?subjectId=course_transformers_w4", { cache: "no-store" });
    const j = await r.json();
    const recall = j.run.levels.filter((l) => l.kind === "recall").map((l) => ({ id: l.id, index: l.index, rounds: l.rounds, questions: (l.items ?? []).map((i) => i.question ?? i.claim) }));
    let local = null;
    try { local = JSON.parse(localStorage.getItem(`aloud.run.${id}`)).levels.filter((l) => l.kind === "recall").map((l) => l.id); } catch { /* none */ }
    return { serverRecall: recall, localRecallIds: local, total: j.run.levels.length };
  }, RUN_ID);
  doc.recallSetup = { typedCatchLevel2: prior.taps, progressAfterLevel2: after, served };
  await page.screenshot({ path: `${shotDir}/live-recall${tag}-map-with-recall-430.png` }).catch(() => {});
  if (!served.serverRecall.length) throw new Error("the run served no recall level after a miss on level 1");
  levelId = served.serverRecall[0].id;
  doc.levelId = levelId;
}
