#!/usr/bin/env node
/**
 * Turns the raw recording (scripts/.tmp-demo/<mode>/) into docs/demo/demo.{mp4,webm,srt}.
 *
 *   node scripts/render-demo.mjs [--mobile]
 *
 * Only two edits are made, both listed in docs/demo/upload.md:
 *   1. waits with no speech on either track are shortened (never a spoken word),
 *   2. dead loading time before and between scenes is cut.
 * Captions come from the recorded events (real examiner transcripts, the spoken text of each
 * synthetic learner WAV, the real tool calls) and are burned in from an ASS file built from the
 * same cue list that is written to demo.srt.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const mobile = process.argv.includes("--mobile");
const mode = mobile ? "mobile" : "desktop";
const dir = path.resolve(process.env.DEMO_DIR ?? path.join("scripts/.tmp-demo", mode));
const outDir = path.resolve(process.env.OUT_DIR ?? "docs/demo");
const tl = JSON.parse(fs.readFileSync(path.join(dir, "timeline.json"), "utf8"));
const RATE = 24000;
const CAP = Number(process.env.SILENCE_CAP ?? 2.4); // longest silent wait kept, seconds
const name = mobile ? "demo-mobile" : "demo";
// Mobile: the phone frame is doubled and a 400 px caption strip is added below it, so captions never cover the app.
const STRIP = 400;
const V = mobile ? { w: 390, h: 844, ow: 780, vh: 1688, oh: 1688 + STRIP } : { w: 1280, h: 720, ow: 1280, vh: 720, oh: 720 };

const sec = (e) => (e - tl.videoStartEpoch) / 1000;
const marks = (n) => tl.marks.filter((m) => m.name === n).map((m) => sec(m.epochMs));
const M = (n, i = 0) => marks(n)[i];
const evs = (type) => tl.events.filter((e) => e.type === type).map((e) => ({ ...e, t: sec(e.epochMs) }));
const has = (n) => marks(n).length > 0;

/* ---------- audio activity (both tracks), 50 ms frames ---------- */
function readWav(f) {
  const b = fs.readFileSync(f);
  return new Int16Array(b.buffer.slice(b.byteOffset + 44, b.byteOffset + 44 + ((b.length - 44) >> 1) * 2));
}
const exA = readWav(path.join(dir, "examiner.wav"));
const leA = readWav(path.join(dir, "learner.wav"));
const FR = 1200;
const nFr = Math.floor(Math.max(exA.length, leA.length) / FR);
const act = (a) => Array.from({ length: nFr }, (_, i) => { let m = 0; for (let j = 0; j < FR; j++) m = Math.max(m, Math.abs(a[i * FR + j] ?? 0)); return m > 500; });
const exAct = act(exA);
const leAct = act(leA);
const anyAct = (i) => exAct[i] || leAct[i];
const FS = FR / RATE;
function runs(mask, from, to, minGap = 0) {
  const out = [];
  let st = null;
  for (let i = Math.floor(from / FS); i < Math.min(mask.length, Math.ceil(to / FS)); i++) {
    if (mask[i]) { if (st === null) st = i; } else if (st !== null) { out.push([st * FS, i * FS]); st = null; }
  }
  if (st !== null) out.push([st * FS, Math.min(mask.length, Math.ceil(to / FS)) * FS]);
  const merged = [];
  for (const r of out) { const l = merged.at(-1); if (l && r[0] - l[1] <= minGap) l[1] = r[1]; else merged.push([...r]); }
  return merged;
}

/* ---------- edit decision list, in raw seconds ---------- */
const keep = [];
const K = (a, b) => { if (b > a) keep.push([Math.max(0, a), Math.min(tl.wallSec, b)]); };
// Live sessions: keep everything, but shorten silent waits longer than CAP.
function keepLive(a, b) {
  const speech = [];
  let st = null;
  for (let i = Math.floor(a / FS); i < Math.ceil(b / FS); i++) {
    if (anyAct(i)) { if (st === null) st = i * FS; } else if (st !== null) { speech.push([st, i * FS]); st = null; }
  }
  if (st !== null) speech.push([st, b]);
  let cur = a;
  const pieces = [];
  for (const [s0, s1] of speech) {
    const gap = s0 - cur;
    if (gap > CAP) { pieces.push([cur, cur + CAP * 0.45]); pieces.push([s0 - CAP * 0.55, s1]); } else pieces.push([cur, s1]);
    cur = s1;
  }
  const tail = b - cur;
  if (tail > CAP) pieces.push([cur, cur + CAP]); else pieces.push([cur, b]);
  for (const p of pieces) K(p[0], p[1]);
}
const sessReady = evs("session.ready").map((e) => e.t);
const sessEnd = evs("session.ended").map((e) => e.t);
const c0 = M("landing");
if (!mobile) {
  K(c0 - 0.3, c0 + 4.4);
  K(c0 + 4.4, c0 + 8.2);
  K(M("cta") - 1.2, M("cta") + 2.4);
  K(M("map-first") - 1.2, M("map-first") + 3.2);
  K(M("tap-say") - 1.2, M("tap-say") + 2.0);
  K(M("intro-say") + 0.4, M("intro-say") + 2.4);
  K(M("start-say") - 0.8, M("start-say") + 1.4);
  keepLive(sessReady[0] - 0.4, sessEnd[0] + 0.3);
  K(M("result-say") - 0.4, M("result-say") + 7.4);
  K(M("map-between") - 0.3, M("map-between") + 1.4);
  K(M("tap-catch") - 0.8, M("tap-catch") + 1.2);
  K(M("intro-catch") + 0.4, M("intro-catch") + 2.0);
  K(M("start-catch") - 0.8, M("start-catch") + 1.2);
  keepLive(sessReady[1] - 0.4, sessEnd[1] + 0.3);
  K(M("result-catch") - 0.4, M("result-catch") + 7.6);
  K(M("map-final") - 0.6, M("map-final") + 5.2);
} else {
  K(c0 - 0.3, c0 + 3.4);
  K(M("cta") - 0.6, M("cta") + 2.0);
  K(M("map-first") - 1.0, M("map-first") + 3.0);
  K(M("tap-say") - 1.0, M("tap-say") + 1.8);
  K(M("intro-say") + 0.4, M("intro-say") + 2.2);
  K(M("start-say") - 0.8, M("start-say") + 1.2);
  keepLive(sessReady[0] - 0.4, sessEnd[0] + 0.3);
  K(M("result-say") - 0.4, M("result-say") + 8.2);
  K(M("map-final") - 0.6, M("map-final") + 4.6);
}
// Merge overlaps and touching segments.
keep.sort((a, b) => a[0] - b[0]);
const segs = [];
for (const k of keep) { const l = segs.at(-1); if (l && k[0] <= l[1] + 0.02) l[1] = Math.max(l[1], k[1]); else segs.push([...k]); }
const starts = [];
let acc = 0;
for (const s of segs) { starts.push(acc); acc += s[1] - s[0]; }
const finalDur = acc;
const toFinal = (t) => { for (let i = 0; i < segs.length; i++) if (t >= segs[i][0] && t <= segs[i][1]) return starts[i] + t - segs[i][0]; return null; };
/** Map a raw interval to final time; returns the hull of the kept parts, or null. */
function mapIv(a, b) {
  let first = null;
  let last = null;
  for (let i = 0; i < segs.length; i++) {
    const s = Math.max(a, segs[i][0]);
    const e = Math.min(b, segs[i][1]);
    if (e - s <= 0.05) continue;
    if (first === null) first = starts[i] + s - segs[i][0];
    last = starts[i] + e - segs[i][0];
  }
  return first === null ? null : [first, last];
}

/* ---------- captions ---------- */
const learnerText = {};
for (const w of ["claim-bluff", "claim-real", "interrupt", "say-weight", "say-why"]) {
  const t = fs.readFileSync(path.resolve("fixtures/audio/live", `${w}.txt`), "utf8").replace(/^\uFEFF/, "");
  learnerText[w] = t.split("Spoken text: ")[1]?.trim() ?? "";
}
const cues = []; // {a,b (raw sec), text, lane, prio}
const cue = (a, b, text, prio, lane = "bottom") => { if (mobile && ["examiner", "learner", "note"].includes(lane)) lane = "bottom"; if (a !== undefined && b !== undefined && !Number.isNaN(a) && b > a) cues.push({ a, b, text, prio, lane }); };
// Examiner speech: each burst of examiner audio gets the real transcript that follows it.
const agentT = evs("transcript.agent");
const bursts = runs(exAct, 0, tl.wallSec, 1.6);
for (const t of agentT) {
  const cand = bursts.filter((r) => r[1] <= t.t + 0.6 && r[1] >= t.t - 8).at(-1);
  if (!cand) continue;
  const sentences = t.text.replace(/\s+/g, " ").match(/[^.?!]+[.?!]+["']?|[^.?!]+$/g) ?? [t.text];
  const chunks = [];
  for (const s of sentences) { const c = chunks.at(-1); if (c && (c.length + s.length) < 120) chunks[chunks.length - 1] = c + s; else chunks.push(s); }
  const tot = chunks.reduce((n, c) => n + c.length, 0);
  let cur = cand[0];
  chunks.forEach((c, i) => {
    const d = ((cand[1] - cand[0]) * c.length) / tot;
    cue(cur, i === chunks.length - 1 ? cand[1] + 0.3 : cur + d, `Examiner (live): "${c.trim()}"`, 5, "examiner");
    cur += d;
  });
}
for (const u of evs("learner.utterance")) cue(u.t, u.t + u.durSec + 0.4, `Learner (synthetic voice): "${learnerText[u.wav]}"`, 5, "learner");
for (const c of evs("tool.call")) cue(c.t, c.t + 3.2, `Tool call from the examiner: ${c.name}`, 4, "note");
const httpEv = evs("tool.http");
for (const p of marks("proof-say")) {
  const h = httpEv.filter((x) => x.t < p && x.quote).at(-1);
  cue(p, p + 3.6, `Proof card: the quote is checked by code against page ${h?.page ?? ""} of the notes.`.replace("page  of", "the page of"), 4, "note");
}
for (const p of marks("reveal-catch")) cue(p, p + 3.2, "The page line is checked by code against your notes.", 3, "note");
const resultOf = (kind) => tl.events.filter((e) => e.type === "result" && e.kind === kind).at(-1)?.text ?? "";
const xp = (kind) => resultOf(kind).match(/\+(\d+)\s*XP/)?.[1];
const mapText = tl.events.find((e) => e.type === "map-text")?.text ?? "";
const mapFacts = (() => {
  const st = mapText.match(/(\d+) day streak/)?.[1];
  const rk = mapText.match(/Rank (\d+)/)?.[1];
  const cl = mapText.match(/(\d+) of (\d+) levels cleared/);
  const parts = [st && `${st} day streak`, rk && `Rank ${rk}`, cl && `${cl[1]} of ${cl[2]} levels cleared`].filter(Boolean);
  return parts.length ? parts.join(", ") : "streak and rank updated";
})();
const rank = (kind) => resultOf(kind).match(/Rank up (\d+) to (\d+)/);
/* narration */
cue(c0, c0 + 4.6, "Aloud turns your notes into a game you play by talking.", 1, "top");
cue(c0 + 4.6, c0 + 9.0, "Every level is one of four kinds: Say it, Catch it, Boss or Recall.", 1, "top");
cue(M("cta") - 0.2, M("cta") + 2.6, "Start the sample run: the sample notes are read and a run of levels is built.", 1);
cue(M("map-first"), M("map-first") + 3.4, "The map: worlds of levels, rank, streak and a daily goal ring.", 1, mobile ? "bottom" : "top");
cue(M("tap-say"), M("intro-say") + 2.4, "Level 1 is Say it: explain a concept out loud. The examiner checks you against your own pages.", 1);
cue(M("start-say"), M("start-say") + 1.4, "Start talking opens a live AssemblyAI Voice Agent session.", 1);
cue(M("result-say") + 0.2, M("result-say") + 8.0, `Level cleared${xp("say") ? `: +${xp("say")} XP` : ""}, stars, and the proof cards it earned.`, 1, "note");
if (!mobile) {
  cue(M("map-between"), M("map-between") + 1.4, "Level 2 is Catch it.", 1, "top");
  cue(M("tap-catch"), M("intro-catch") + 2.0, "The examiner states claims from your notes. Some are real, one is planted. Say which.", 1);
  cue(M("result-catch") + 0.2, M("result-catch") + 7.6, `Bluff caught${xp("catch") ? `: +${xp("catch")} XP` : ""}${rank("catch") ? `, rank up ${rank("catch")[1]} to ${rank("catch")[2]}` : ""}.`, 1, "note");
  cue(M("map-final"), M("map-final") + 5.6, `Back on the map: ${mapFacts}.`, 1, "top");
} else {
  cue(M("map-final"), M("map-final") + 4.6, `Back on the map: ${mapFacts}.`, 1, "top");
}
// One lane per position: higher priority wins, lower priority is trimmed to what is left.
const placed = [];
const LANES = ["bottom", "top", "examiner", "learner", "note"];
for (const lane of LANES) {
  const occ = [];
  for (const c of cues.filter((x) => x.lane === lane).sort((x, y) => y.prio - x.prio || x.a - y.a)) {
    let pieces = [[c.a, c.b]];
    for (const [oa, ob] of occ) pieces = pieces.flatMap(([pa, pb]) => (ob <= pa || oa >= pb ? [[pa, pb]] : [[pa, Math.min(pb, oa)], [Math.max(pa, ob), pb]].filter((p) => p[1] - p[0] > 0)));
    const best = pieces.sort((p, q) => q[1] - q[0] - (p[1] - p[0]))[0];
    if (!best) continue;
    const m = mapIv(best[0], best[1]);
    if (!m || m[1] - m[0] < 1.0) continue;
    occ.push([best[0], best[1]]);
    placed.push({ start: m[0], end: m[1], text: c.text, lane });
  }
}
placed.push({ start: 0.0, end: Math.min(8.5, finalDur), lane: "label", text: "Learner voice is synthetic. Examiner audio and tool calls are from a live AssemblyAI Voice Agent session recorded on 2026-09-30." });
placed.sort((a, b) => a.start - b.start);
// No overlap inside a lane after mapping (cuts can push cues together).
for (const lane of [...LANES, "label"]) {
  const l = placed.filter((p) => p.lane === lane);
  for (let i = 1; i < l.length; i++) if (l[i].start < l[i - 1].end) l[i - 1].end = l[i].start;
}
const finalCues = placed.filter((p) => p.end - p.start >= 0.6);

const ts = (t, comma = true) => { const ms = Math.round(t * 1000); const h = Math.floor(ms / 3600000); const m = Math.floor((ms % 3600000) / 60000); const s = Math.floor((ms % 60000) / 1000); const r = ms % 1000; const p = (n, w = 2) => String(n).padStart(w, "0"); return comma ? `${p(h)}:${p(m)}:${p(s)},${p(r, 3)}` : `${h}:${p(m)}:${p(s)}.${p(Math.floor(r / 10))}`; };
const wrap = (t, n) => {
  const nLines = Math.max(1, Math.ceil(t.length / n));
  const target = Math.ceil(t.length / nLines) + 3; // balanced lines, no one-word orphans
  const lines = [];
  let cur = "";
  for (const w of t.split(" ")) { if ((cur + " " + w).trim().length > target && cur) { lines.push(cur.trim()); cur = w; } else cur += " " + w; }
  lines.push(cur.trim());
  return lines;
};
const wrapAt = mobile ? 34 : 60;
const laneWrap = { bottom: wrapAt, top: wrapAt, label: mobile ? 34 : 60, examiner: 23, learner: 23, note: 23 };
const srt = finalCues.map((c, i) => `${i + 1}\n${ts(c.start)} --> ${ts(c.end)}\n${wrap(c.text, laneWrap[c.lane]).join("\n")}\n`).join("\n");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, `${name}.srt`), srt, "utf8");
const fs_ = mobile ? 30 : 28;
const sideFs = 26;
const box = "&H30141414"; // dark box, about 80 percent opaque
const st = (n, size, col, al, ml, mr, mv, bold = 0) => `Style: ${n},Arial,${size},${col},${col},${box},&H00000000,${bold},0,0,0,100,100,0,0,3,9,0,${al},${ml},${mr},${mv},1`;
const G = mobile ? 24 : 60;
const styles = [
  st("Bottom", fs_, "&H00FFFFFF", 2, G, G, mobile ? 30 : 26),
  st("Top", fs_, "&H00FFFFFF", 8, G, G, mobile ? 30 : 84),
  st("Label", fs_ - 2, "&H0010D8FF", mobile ? 8 : 2, G, G, mobile ? V.vh + 14 : 26, 1),
  st("Ex", sideFs, "&H00FFFFFF", 4, 36, V.ow - 36 - 384, 0),
  st("Le", sideFs, "&H0080E0FF", 6, V.ow - 36 - 384, 36, 0),
  st("Note", sideFs, "&H00FFFFFF", 1, 36, V.ow - 36 - 384, 40),
].join("\n");
const styleOf = { bottom: "Bottom", top: mobile ? "Bottom" : "Top", label: "Label", examiner: "Ex", learner: "Le", note: "Note" };
const ass = `[Script Info]
ScriptType: v4.00+
PlayResX: ${V.ow}
PlayResY: ${V.oh}
WrapStyle: 2

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
${styles}

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${finalCues.map((c) => `Dialogue: 0,${ts(c.start, false)},${ts(c.end, false)},${styleOf[c.lane]},,0,0,0,,${wrap(c.text, laneWrap[c.lane]).join("\\N")}`).join("\n")}
`;
fs.writeFileSync(path.join(dir, "cap.ass"), ass, "utf8");

/* ---------- filter graph ---------- */
const N = segs.length;
const lines = [];
lines.push(`[1:a][2:a]amix=inputs=2:normalize=0:duration=longest,aresample=48000[mix]`);
lines.push(`[0:v]split=${N}${segs.map((_, i) => `[s${i}]`).join("")}`);
lines.push(`[mix]asplit=${N}${segs.map((_, i) => `[m${i}]`).join("")}`);
segs.forEach(([a, b], i) => {
  const d = b - a;
  lines.push(`[s${i}]trim=start=${a.toFixed(3)}:end=${b.toFixed(3)},setpts=PTS-STARTPTS[v${i}]`);
  lines.push(`[m${i}]atrim=start=${a.toFixed(3)}:end=${b.toFixed(3)},asetpts=PTS-STARTPTS,afade=t=in:d=0.03,afade=t=out:st=${Math.max(0, d - 0.03).toFixed(3)}:d=0.03[a${i}]`);
});
lines.push(`${segs.map((_, i) => `[v${i}][a${i}]`).join("")}concat=n=${N}:v=1:a=1[vc][ac]`);
const scale = mobile ? `scale=${V.ow}:${V.vh}:flags=lanczos,pad=${V.ow}:${V.oh}:0:0:color=0x141414,` : "";
lines.push(`[vc]fps=25,${scale}subtitles=cap.ass:fontsdir='C\\:/Windows/Fonts'[vout]`);
lines.push(`[ac]loudnorm=I=-16:TP=-1.5:LRA=11[aout]`);
fs.writeFileSync(path.join(dir, "graph.txt"), lines.join(";\n"), "utf8");

const mp4 = path.join(outDir, `${name}.mp4`);
const args = ["-hide_banner", "-loglevel", "error", "-y", "-i", "raw.webm", "-i", "examiner.wav", "-i", "learner.wav", "-/filter_complex", "graph.txt", "-map", "[vout]", "-map", "[aout]", "-c:v", "libx264", "-preset", process.env.FAST ? "ultrafast" : "medium", "-crf", "23", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-c:a", "aac", "-b:a", "128k", "-metadata", "title=Aloud demo (synthetic learner voice, live examiner session 2026-09-30)", mp4];
console.log("segments", N, "final duration", finalDur.toFixed(1), "s; rendering...");
let r = spawnSync("ffmpeg", args, { cwd: dir, stdio: "inherit" });
if (r.status !== 0) process.exit(r.status ?? 1);
if (!mobile && !process.env.FAST) {
  r = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", mp4, "-c:v", "libvpx-vp9", "-crf", "34", "-b:v", "0", "-row-mt", "1", "-deadline", "good", "-cpu-used", "5", "-c:a", "libopus", "-b:a", "96k", path.join(outDir, `${name}.webm`)], { stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
/* ---------- voiceover script for the owner: only the narration lines, with the speech windows to keep clear ---------- */
if (!mobile) {
  const speechWin = runs(anyAct, 0, tl.wallSec, 0.8).map(([a, b]) => mapIv(a, b)).filter(Boolean);
  const mmss = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
  const overlap = (a, b) => speechWin.reduce((n, [x, y]) => n + Math.max(0, Math.min(b, y) - Math.max(a, x)), 0);
  const rows = finalCues
    .filter((c) => ["bottom", "top", "note"].includes(c.lane))
    .filter((c) => !/^(Examiner|Learner|Tool call)/.test(c.text))
    .map((c) => `| ${mmss(c.start)} to ${mmss(c.end)} | ${(c.end - c.start).toFixed(1)} s | ${c.text} | ${overlap(c.start, c.end) > 0.4 ? "examiner or learner audio is playing: skip, or speak under it" : "clear"} |`);
  const clear = speechWin.map(([a, b]) => `${mmss(a)} to ${mmss(b)}`).join(", ");
  const md = `# Voiceover script (optional)

The video ships with the real examiner audio, the synthetic learner voice and burned-in captions. If you record your own voice over it, use only the lines below, in the gaps. Do not talk over the examiner or the learner: their audio is the evidence.

Do not say the learner voice is yours. It is synthetic, and the first caption says so. Do not say the examiner adapts or remembers beyond what the screen shows.

Total length: ${mmss(finalDur)} (${finalDur.toFixed(1)} s). Times are in the final video, not the raw recording.

| Time | Length | Line | Audio under it |
|---|---|---|---|
${rows.join("\n")}

Windows where the examiner or the learner is speaking (keep these clear): ${clear}.

Recorded on ${tl.recordedOn.slice(0, 10)}. Regenerate with \`node scripts/record-demo.mjs\` after starting the dev server with DATABASE_URL blank.
`;
  fs.writeFileSync(path.join(outDir, "VOICEOVER.md"), md, "utf8");
}
fs.writeFileSync(path.join(dir, "final-map.json"), JSON.stringify({ segs, starts, finalDur, cues: finalCues }, null, 1), "utf8");
console.log("wrote", mp4, (fs.statSync(mp4).size / 1e6).toFixed(1), "MB");
