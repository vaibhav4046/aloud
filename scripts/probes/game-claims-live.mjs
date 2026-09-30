#!/usr/bin/env node
/**
 * Live probe: for every Catch it claim in a subject's run, ask the real verify_claim tool
 * (server route, real model judge) and compare the verdict with the claim's stored flag.
 *
 *   node scripts/probes/game-claims-live.mjs --base http://localhost:3000 [--subject course_transformers_w4] [--out file.json]
 *
 * A real claim should come back "supported" and a bluff "contradicted", each with a quote and a page.
 * The game scores a Catch it round from the flag, not from this verdict, so a mismatch costs the
 * player a page proof, never points. This probe measures how often the proof is there.
 * It prints no cookie, key or token.
 */
import fs from "node:fs";
const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : dflt; };
const base = arg("--base"), subject = arg("--subject", "course_transformers_w4"), out = arg("--out");
if (!base) { console.error("Give --base <url>"); process.exit(2); }
const jar = new Map();
async function call(path, init = {}) {
  const headers = { ...(init.headers ?? {}) };
  if (jar.size) headers.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  const res = await fetch(base.replace(/\/$/, "") + path, { ...init, headers, signal: AbortSignal.timeout(30_000) });
  for (const line of res.headers.getSetCookie?.() ?? []) { const q = line.split(";")[0]; const e = q.indexOf("="); if (e > 0) jar.set(q.slice(0, e), q.slice(e + 1)); }
  return res.json();
}
const { run } = await call(`/api/game/run?subjectId=${subject}`);
const rows = [];
for (const level of run.levels.filter((l) => l.kind === "catch")) {
  for (const item of level.items) {
    const t0 = Date.now();
    const v = await call("/api/oral/tool", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ callId: `p${rows.length}`, name: "verify_claim", subjectId: subject, levelId: level.id, sessionId: "probe", arguments: { claim: item.claim } }) });
    const r = v.result ?? {};
    const expected = item.isBluff ? "contradicted" : "supported";
    rows.push({ level: level.id, isBluff: item.isBluff, alteration: item.alteration?.kind ?? (item.isBluff ? "trap" : null), expected, verdict: r.verdict ?? null,
      proofOk: r.verdict === expected && !!r.quote && r.page != null, page: r.page ?? null, ms: Date.now() - t0 });
  }
}
const sum = (f) => rows.filter(f).length;
const summary = {
  probe: "game-claims-live", date: new Date().toISOString().slice(0, 10), subject, n: rows.length,
  service: "real model judge through /api/oral/tool, local Next server", learner: "none, claims are the run's own items",
  real: { n: sum((r) => !r.isBluff), proofOk: sum((r) => !r.isBluff && r.proofOk) },
  bluff: { n: sum((r) => r.isBluff), proofOk: sum((r) => r.isBluff && r.proofOk),
    notInMaterial: sum((r) => r.isBluff && r.verdict === "not_in_material"), wronglySupported: sum((r) => r.isBluff && r.verdict === "supported") },
  rows,
};
if (out) fs.writeFileSync(out, JSON.stringify(summary, null, 2) + "\n", "utf8");
console.log(JSON.stringify({ ...summary, rows: undefined }));
