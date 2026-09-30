#!/usr/bin/env node
/**
 * Checks the demo deliverables with ffprobe. Exit code 1 on any failed check.
 *
 *   node scripts/verify-video.mjs [--frames]
 *
 * --frames also extracts one frame every 5 s of docs/demo/demo.mp4 to docs/evidence/video-frames/.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const demoDir = path.resolve("docs/demo");
const MAX_SEC = 180;
const MAX_MB = 40;
let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? "PASS" : "FAIL"} ${msg}`); if (!ok) failed++; };

function probe(file) {
  const r = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration,size:stream=codec_type,codec_name,width,height,pix_fmt", "-of", "json", file], { encoding: "utf8" });
  if (r.status !== 0) return null;
  return JSON.parse(r.stdout);
}
function parseSrt(text) {
  const blocks = text.replace(/\r/g, "").trim().split(/\n\n+/);
  const cues = [];
  for (const b of blocks) {
    const l = b.split("\n");
    const m = l[1]?.match(/^(\d\d):(\d\d):(\d\d),(\d{3}) --> (\d\d):(\d\d):(\d\d),(\d{3})$/);
    if (!m || !/^\d+$/.test(l[0]) || l.length < 3) return null;
    const t = (o) => Number(m[o]) * 3600 + Number(m[o + 1]) * 60 + Number(m[o + 2]) + Number(m[o + 3]) / 1000;
    cues.push({ start: t(1), end: t(5), text: l.slice(2).join(" ") });
  }
  return cues;
}

for (const [file, srtFile] of [["demo.mp4", "demo.srt"], ["demo.webm", "demo.srt"], ["demo-mobile.mp4", "demo-mobile.srt"]]) {
  const p = path.join(demoDir, file);
  if (!fs.existsSync(p)) { if (file === "demo-mobile.mp4") { console.log(`SKIP ${file} (not recorded)`); continue; } check(false, `${file} exists`); continue; }
  const info = probe(p);
  if (!info) { check(false, `${file} ffprobe reads it`); continue; }
  const dur = Number(info.format.duration);
  const v = info.streams.find((s) => s.codec_type === "video");
  const a = info.streams.find((s) => s.codec_type === "audio");
  const mb = fs.statSync(p).size / 1e6;
  check(dur < MAX_SEC, `${file} duration ${dur.toFixed(1)} s < ${MAX_SEC}`);
  check(!!v, `${file} has a video stream (${v?.codec_name} ${v?.width}x${v?.height} ${v?.pix_fmt ?? ""})`);
  check(!!a, `${file} has an audio stream (${a?.codec_name})`);
  check(mb < MAX_MB, `${file} size ${mb.toFixed(1)} MB < ${MAX_MB}`);
  if (file.endsWith(".mp4")) check(v?.codec_name === "h264" && v?.pix_fmt === "yuv420p", `${file} is H.264 yuv420p`);
  const cues = parseSrt(fs.readFileSync(path.join(demoDir, srtFile), "utf8"));
  check(!!cues && cues.length > 0, `${srtFile} parses (${cues?.length ?? 0} cues)`);
  if (cues) {
    check(cues.every((c) => c.end > c.start), `${srtFile} every cue ends after it starts`);
    check(cues.every((c, i) => i === 0 || c.start >= cues[0].start), `${srtFile} cues start at or after the first`);
    check(cues.at(-1).end <= dur + 0.5, `${srtFile} last cue ends inside the video (${cues.at(-1).end.toFixed(1)} s)`);
    check(!new RegExp("[" + String.fromCharCode(8211, 8212) + "!]").test(cues.map((c) => c.text).join(" ")), `${srtFile} has no dashes or exclamation marks`);
    check(/synthetic/i.test(cues[0].text), `${srtFile} first cue labels the learner voice as synthetic`);
  }
}
const up = path.join(demoDir, "upload.md");
if (fs.existsSync(up)) check(/Learner voice is synthetic\. Examiner audio and tool calls are from a live AssemblyAI Voice Agent session recorded on 2026-09-30\./.test(fs.readFileSync(up, "utf8")), "upload.md carries the synthetic-voice label verbatim");
else check(false, "upload.md exists");

if (process.argv.includes("--frames") && fs.existsSync(path.join(demoDir, "demo.mp4"))) {
  const fdir = path.resolve("docs/evidence/video-frames");
  fs.mkdirSync(fdir, { recursive: true });
  const r = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", path.join(demoDir, "demo.mp4"), "-vf", "fps=1/5", path.join(fdir, "frame-%03d.png")], { stdio: "inherit" });
  check(r.status === 0, `frames extracted every 5 s to ${fdir} (${fs.readdirSync(fdir).filter((f) => f.endsWith(".png")).length} files)`);
}
console.log(failed ? `${failed} check(s) failed` : "all checks passed");
process.exit(failed ? 1 : 0);
