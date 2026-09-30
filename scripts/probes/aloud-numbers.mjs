#!/usr/bin/env node
/**
 * Summarises the committed live level drives (docs/evidence/probes/aloud-*.json,
 * synthetic learner voice, real AssemblyAI Voice Agent, Node + Chromium) into
 * docs/evidence/probes/aloud-summary.<date>.json and merges the published keys
 * (prefix "aloud.") into numbers.json. Only measured values are written; every
 * entry names the file it came from.
 *
 *   node scripts/probes/aloud-numbers.mjs
 */
import fs from "node:fs";

const dir = "docs/evidence/probes";
const files = fs.readdirSync(dir).filter((f) => /^aloud-(calibrate|say|catch|bargein|bargein-say|typed-say|typed-catch)[^.]*\.\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
const docs = files.map((f) => ({ f, d: JSON.parse(fs.readFileSync(`${dir}/${f}`, "utf8")) }));
const voice = docs.filter(({ d }) => d.ws.some((e) => e.type === "session.ready"));
const median = (a) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor((a.length - 1) / 2)] : null);
const stat = (a) => ({ n: a.length, median: median(a), min: a.length ? Math.min(...a) : null, max: a.length ? Math.max(...a) : null });

const sessionReady = [], firstAudio = [], userToCall = [], callToResult = [], resultToAudio = [], finalReplyToResultScreen = [];
const toolHttp = { grade_my_answer: [], verify_claim: [] };
const bargeSpeechToInterrupted = [], bargeInjectToSpeech = [];
// Drives after the final end-of-level wait (activity-reset window): the catch inject2 run, the injected say run and the barge-in level runs.
const afterFinalFix = (f) => /^aloud-(catch-inject2|say-inject|bargein-say-rd)./.test(f);
for (const { f, d } of voice) {
  const ws = d.ws;
  const ready = ws.find((e) => e.type === "session.ready");
  const aud = ws.find((e) => e.type === "reply.audio");
  if (ready) sessionReady.push(ready.t);
  if (aud) firstAudio.push(aud.t);
  ws.forEach((e, i) => {
    if (e.type === "tool.call") {
      const u = [...ws.slice(0, i)].reverse().find((x) => x.type === "transcript.user");
      if (u) userToCall.push(e.t - u.t);
      const r = ws.slice(i).find((x) => x.type === "tool.result");
      if (r) {
        callToResult.push(r.t - e.t);
        const a = ws.slice(i).find((x) => x.type === "reply.audio" && x.t >= r.t);
        if (a) resultToAudio.push(a.t - r.t);
      }
    }
  });
  const lastDone = [...ws].reverse().find((x) => x.type === "reply.done");
  const res = d.dom.find((s) => s.phase === "result");
  if (lastDone && res && afterFinalFix(f)) finalReplyToResultScreen.push(res.t - lastDone.t);
  const ss = ws.find((e) => e.type === "input.speech.started");
  const intr = ws.find((e) => e.type === "reply.done" && e.status === "interrupted");
  if (d.scenario.startsWith("bargein") && ss && intr) {
    bargeSpeechToInterrupted.push(intr.t - ss.t);
    const inj = d.injected?.[0];
    if (inj) bargeInjectToSpeech.push(ss.t - inj.atMs);
  }
}
for (const { d } of docs) for (const h of d.http) if (/oral\/tool/.test(h.url) && h.name in toolHttp && h.status === 200) toolHttp[h.name].push(h.ms);
const typedGrade = docs.filter(({ d }) => d.scenario === "typed-say").flatMap(({ d }) => d.http.filter((h) => h.name === "grade_my_answer").map((h) => h.ms));

const levels = docs.filter(({ d }) => d.localProgress && Object.keys(d.localProgress.results).length && !d.failure);
const outcomeRounds = levels.flatMap(({ d }) => Object.values(d.localProgress.results).flatMap((r) => r.rounds));
const vcFile = fs.readdirSync(dir).filter((f) => /^aloud-verify-catch\.\d{4}/.test(f)).sort().at(-1);
const vc = JSON.parse(fs.readFileSync(`${dir}/${vcFile}`, "utf8"));

const date = new Date().toISOString().slice(0, 10);
const summary = {
  measuredOn: new Date().toISOString(),
  node: process.version,
  chromium: voice[0]?.d.chromium ?? null,
  learnerVoice: "synthetic (Windows System.Speech), not a human voice",
  service: "AssemblyAI Voice Agent, real socket, dev server on localhost, sample course (course_transformers_w4)",
  sourceFiles: files,
  voiceRuns: voice.length,
  sessionReadyMsAfterClick: stat(sessionReady),
  firstExaminerAudioMsAfterClick: stat(firstAudio),
  learnerFinalTranscriptToToolCallMs: stat(userToCall),
  toolCallToToolResultSentMs: stat(callToResult),
  toolResultSentToNextExaminerAudioMs: stat(resultToAudio),
  toolHttpMs: { grade_my_answer: stat(toolHttp.grade_my_answer), verify_claim: stat(toolHttp.verify_claim) },
  typedGradeHttpMs: stat(typedGrade),
  lastExaminerReplyDoneToResultScreenMs: stat(finalReplyToResultScreen),
  bargeIn: { learnerSpeechStartedToInterruptedReplyDoneMs: stat(bargeSpeechToInterrupted), injectedAudioToSpeechStartedMs: stat(bargeInjectToSpeech) },
  levelsPlayedToResult: levels.length,
  roundOutcomes: Object.fromEntries([...new Set(outcomeRounds)].map((o) => [o, outcomeRounds.filter((x) => x === o).length])),
  verifyCatch: { file: vcFile, real: vc.summary.real, bluff: vc.summary.bluff },
};
const out = `${dir}/aloud-summary.${date}.json`;
fs.writeFileSync(out, JSON.stringify(summary, null, 1) + "\n", "utf8");

const cmd = "node scripts/probes/aloud-numbers.mjs (after the drives in scripts/probes/aloud-live-drive.mjs)";
const numbers = JSON.parse(fs.readFileSync("numbers.json", "utf8"));
const add = (key, value, n, note, evidence = out) => {
  if (value === null || value === undefined) return;
  numbers[key] = { value, n, date, evidence, cmd, note: `${note} Synthetic learner voice, Node ${process.version}, Chromium ${summary.chromium}.` };
};
add("aloud.live.sessionReadyMs", summary.sessionReadyMsAfterClick.median, summary.sessionReadyMsAfterClick.n, "Median click on Start talking to session.ready, dev server (some runs include a route compile).");
add("aloud.live.firstExaminerAudioMs", summary.firstExaminerAudioMsAfterClick.median, summary.firstExaminerAudioMsAfterClick.n, "Median click to first examiner audio frame.");
add("aloud.live.toolCallToResultMs", summary.toolCallToToolResultSentMs.median, summary.toolCallToToolResultSentMs.n, "Median tool.call received to tool.result sent, includes the real grader or page check.");
add("aloud.live.gradeToolHttpMs", summary.toolHttpMs.grade_my_answer.median, summary.toolHttpMs.grade_my_answer.n, "Median /api/oral/tool grade_my_answer round trip seen by the browser.");
add("aloud.live.verifyToolHttpMs", summary.toolHttpMs.verify_claim.median, summary.toolHttpMs.verify_claim.n, "Median /api/oral/tool verify_claim round trip seen by the browser.");
add("aloud.live.bargeInInterruptedMs", summary.bargeIn.learnerSpeechStartedToInterruptedReplyDoneMs.median, summary.bargeIn.learnerSpeechStartedToInterruptedReplyDoneMs.n, "Median input.speech.started to reply.done interrupted inside a level.");
add("aloud.live.finalReplyToResultScreenMs", summary.lastExaminerReplyDoneToResultScreenMs.median, summary.lastExaminerReplyDoneToResultScreenMs.n, "Median last examiner reply.done to the result screen rendering (runs after the end-of-level wait fix only).");
add("aloud.verifyCatch.realSupported", summary.verifyCatch.real.supported, summary.verifyCatch.real.n, "Real catch claims that the live page check returned supported.", `${dir}/${vcFile}`);
add("aloud.verifyCatch.bluffContradicted", summary.verifyCatch.bluff.contradicted, summary.verifyCatch.bluff.n, "Planted bluff claims that the live page check returned contradicted.", `${dir}/${vcFile}`);
add("aloud.verifyCatch.bluffSupported", summary.verifyCatch.bluff.supported, summary.verifyCatch.bluff.n, "Planted bluff claims that the live page check wrongly returned supported.", `${dir}/${vcFile}`);
fs.writeFileSync("numbers.json", JSON.stringify(numbers, null, 2) + "\n", "utf8");
console.log(JSON.stringify(summary, null, 1));
