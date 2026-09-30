#!/usr/bin/env node
/**
 * Live check of the page check the Catch-it levels depend on: for every claim in
 * every catch level of the sample run, ask the real /api/oral/tool verify_claim
 * (the same call the game makes) and compare its verdict with the run's own
 * flag. A real claim should come back "supported", a bluff "contradicted".
 *
 *   BASE_URL=http://localhost:3261 node scripts/probes/aloud-verify-catch.mjs [--repeats 2]
 *
 * Output: docs/evidence/probes/aloud-verify-catch.<date>.json
 */
import fs from "node:fs";

const base = process.env.BASE_URL ?? "http://localhost:3261";
const ri = process.argv.indexOf("--repeats");
const repeats = ri >= 0 ? Number(process.argv[ri + 1]) : 2;
const date = new Date().toISOString().slice(0, 10);

const first = await fetch(`${base}/api/game/run`, { signal: AbortSignal.timeout(60000) });
const cookie = (first.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
const { run } = await first.json();
const rows = [];
for (const level of run.levels.filter((l) => l.kind === "catch" || l.kind === "boss")) {
  for (const [i, item] of (level.items ?? []).entries()) {
    if (item.type !== "catch") continue;
    for (let r = 0; r < repeats; r++) {
      const t = Date.now();
      const res = await fetch(`${base}/api/oral/tool`, {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie },
        body: JSON.stringify({ callId: `probe_${level.id}_${i}_${r}`, name: "verify_claim", arguments: { claim: item.claim, concept: item.conceptId }, subjectId: run.subjectId, levelId: level.id }),
        signal: AbortSignal.timeout(20000),
      }).catch((e) => ({ ok: false, status: 0, json: async () => ({ error: String(e) }) }));
      const j = await res.json().catch(() => ({}));
      rows.push({ level: level.id, item: i, isBluff: item.isBluff, alteration: item.alteration?.kind ?? null, verdict: j.result?.verdict ?? null, status: res.status, ms: Date.now() - t, repeat: r });
    }
  }
}
const expected = (r) => (r.isBluff ? "contradicted" : "supported");
const tally = (rs) => ({ n: rs.length, matches: rs.filter((r) => r.verdict === expected(r)).length, supported: rs.filter((r) => r.verdict === "supported").length, contradicted: rs.filter((r) => r.verdict === "contradicted").length, not_in_material: rs.filter((r) => r.verdict === "not_in_material").length, other: rs.filter((r) => !["supported", "contradicted", "not_in_material"].includes(r.verdict)).length });
const kinds = [...new Set(rows.filter((r) => r.isBluff).map((r) => r.alteration))];
const summary = { real: tally(rows.filter((r) => !r.isBluff)), bluff: tally(rows.filter((r) => r.isBluff)), byAlteration: Object.fromEntries(kinds.map((k) => [k, tally(rows.filter((r) => r.isBluff && r.alteration === k))])) };
const out = `docs/evidence/probes/aloud-verify-catch.${date}.json`;
fs.writeFileSync(out, JSON.stringify({ measuredOn: new Date().toISOString(), node: process.version, base, repeats, note: "verify_claim called with the claim text and concept, levelId set, real model", summary, rows }, null, 1) + "\n", "utf8");
console.log(JSON.stringify(summary));
console.log("out:", out);
