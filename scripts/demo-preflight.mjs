#!/usr/bin/env node
/**
 * Demo preflight: run this before the recording. Prints GO or NO-GO with reasons.
 *
 *   node scripts/demo-preflight.mjs --base https://your-deployment.example
 *   node scripts/demo-preflight.mjs --base http://localhost:3000
 *   DEMO_BASE=http://localhost:3000 node scripts/demo-preflight.mjs
 *
 * The base URL is required: there is no default, so it cannot check the wrong site by accident.
 *
 * Checks the deployment the take will use:
 *   1 health        GET /api/health
 *   2 readiness     GET /api/health/ready (model provider usable, storage durability)
 *   3 token mint    GET /api/voice-agent/token returns a token (only its length is printed)
 *   4 sample run    GET /api/game/run for the sample subject: 12 to 30 levels, a boss, a catch level
 *                   holding one real claim and one bluff
 *   5 level config  GET /api/oral/session with the first catch level: the level id comes back and the
 *                   verify_claim tool is offered
 *   6 bluff check   POST /api/oral/tool verify_claim on bluffs, in order, until one comes back
 *                   "contradicted" with a quote and a page (up to 12 tried). Names the level to record.
 *   7 real check    the same call on a real claim in that level: "supported" (warning only, the judge
 *                   can abstain)
 *   8 progress      GET /api/game/progress answers
 *   9 pages         /, /run/new answer; /privacy, /terms answer (warning only)
 *
 * It never prints a token, a key or a cookie. The identity cookie is held in memory and sent back so
 * the run, the level and the tool call belong to one learner. Every request has a 25 s timeout.
 * Exit 0 on GO, 1 on NO-GO, 2 when no base URL was given.
 */
const argAt = process.argv.indexOf("--base");
const rawBase = argAt > 0 ? process.argv[argAt + 1] : process.env.DEMO_BASE;
if (!rawBase) {
  console.error("Give the deployment to check: node scripts/demo-preflight.mjs --base <url>");
  process.exit(2);
}
const base = rawBase.replace(/\/$/, "");
const SAMPLE = "course_transformers_w4";
const TIMEOUT_MS = 25_000;
const MIN_LEVELS = 12;
const MAX_LEVELS = 30;
const MAX_BLUFF_TRIES = 12;

const blockers = [];
const warnings = [];
const lines = [];
const ok = (name, detail) => lines.push(`pass  ${name}${detail ? `: ${detail}` : ""}`);
const fail = (name, why) => { blockers.push(`${name}: ${why}`); lines.push(`FAIL  ${name}: ${why}`); };
const warn = (name, why) => { warnings.push(`${name}: ${why}`); lines.push(`warn  ${name}: ${why}`); };

/** name=value pairs the server set, kept in memory and sent back. Never printed. */
const jar = new Map();

async function call(path, init = {}) {
  const started = Date.now();
  const headers = { ...(init.headers ?? {}) };
  if (jar.size) headers.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  try {
    const res = await fetch(base + path, { ...init, headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
    for (const line of res.headers.getSetCookie?.() ?? []) {
      const pair = line.split(";")[0];
      const eq = pair.indexOf("=");
      if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: res.status, json, ms: Date.now() - started };
  } catch (e) {
    return { status: 0, json: null, ms: Date.now() - started, error: e?.name === "TimeoutError" ? `no answer in ${TIMEOUT_MS / 1000} s` : (e?.cause?.code ?? e?.message ?? "request failed") };
  }
}

const reason = (r) => r.error ?? `HTTP ${r.status}${r.json?.error?.code ? ` ${r.json.error.code}` : ""}`;

const health = await call("/api/health");
if (health.status === 200 && health.json?.ok === true) ok("health", `${health.ms} ms, version ${health.json.version ?? "unknown"}`);
else fail("health", reason(health));

const ready = await call("/api/health/ready");
if (ready.status !== 200 || !ready.json) fail("readiness", reason(ready));
else {
  const r = ready.json;
  if (r.provider?.usable === true) ok("model provider", `usable, model ${r.provider.model ?? "unnamed"}`);
  else fail("model provider", "no usable model provider; verify_claim cannot catch a bluff without one");
  if (r.durable === true) ok("storage", `durable (${r.database?.backend ?? r.backend ?? "unknown backend"})`);
  else warn("storage", "ephemeral: runs and progress reset on restart. Say so on camera or use a durable deployment.");
}

const token = await call("/api/voice-agent/token");
if (token.status === 200 && typeof token.json?.token === "string" && token.json.token.length > 20) {
  ok("token mint", `${token.ms} ms, ${token.json.token.length} characters, expires in ${token.json.expiresInSeconds ?? token.json.expires_in_seconds ?? "unknown"} s`);
} else fail("token mint", reason(token));

let run = null;
const runRes = await call(`/api/game/run?subjectId=${SAMPLE}`);
if (runRes.status === 200 && Array.isArray(runRes.json?.run?.levels)) {
  run = runRes.json.run;
  const n = run.levels.length;
  const kinds = {};
  for (const l of run.levels) kinds[l.kind] = (kinds[l.kind] ?? 0) + 1;
  if (n < MIN_LEVELS || n > MAX_LEVELS) fail("sample run", `${n} levels, expected ${MIN_LEVELS} to ${MAX_LEVELS}`);
  else if (!kinds.boss || !kinds.catch || !kinds.say) fail("sample run", `missing a level kind: ${JSON.stringify(kinds)}`);
  else ok("sample run", `${n} levels in ${run.worlds?.length ?? "?"} worlds, ${JSON.stringify(kinds)}, ${runRes.ms} ms`);
} else fail("sample run", reason(runRes));

const catchLevels = (run?.levels ?? []).filter((l) => l.kind === "catch" && l.items?.some((i) => i.isBluff) && l.items?.some((i) => !i.isBluff));
if (run && catchLevels.length === 0) fail("catch level", "no catch level holds both a real claim and a bluff");

async function verify(level, item, id) {
  return call("/api/oral/tool", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ callId: id, name: "verify_claim", subjectId: SAMPLE, sessionId: "preflight", levelId: level.id, arguments: { claim: item.claim } }),
  });
}

if (catchLevels.length) {
  const first = catchLevels[0];
  const cfg = await call(`/api/oral/session?subjectId=${SAMPLE}&levelId=${encodeURIComponent(first.id)}`);
  const names = (cfg.json?.tools ?? []).map((t) => t.name);
  if (cfg.status === 200 && cfg.json?.levelId === first.id && cfg.json.system_prompt && names.includes("verify_claim")) {
    ok("level config", `${first.id}, tools: ${names.join(", ")}, ${cfg.ms} ms`);
  } else fail("level config", cfg.status === 200 ? `levelId ${cfg.json?.levelId ?? "missing"}, tools ${names.join(", ") || "none"}` : reason(cfg));

  // The judge is a model and does not prove every altered claim. The take needs one catch level
  // where a bluff comes back contradicted with a quote and a page, so look for it and say which.
  let proven = null;
  let tried = 0;
  for (const level of catchLevels) {
    for (const item of level.items.filter((i) => i.isBluff)) {
      if (tried >= MAX_BLUFF_TRIES) break;
      tried += 1;
      const v = await verify(level, item, `preflight-bluff-${tried}`);
      const result = v.json?.result;
      if (v.status === 200 && result?.verdict === "contradicted" && result.quote && result.page != null) { proven = { level, item, result, ms: v.ms }; break; }
    }
    if (proven || tried >= MAX_BLUFF_TRIES) break;
  }
  if (proven) {
    ok("bluff check", `level "${proven.level.title}" (${proven.level.id}) proves its bluff: contradicted, page ${proven.result.page}, ${proven.ms} ms, after ${tried} bluff${tried === 1 ? "" : "s"} tried. Record this level.`);
    const real = proven.level.items.find((i) => !i.isBluff);
    const v = await verify(proven.level, real, "preflight-real");
    const result = v.json?.result;
    if (v.status === 200 && result?.verdict === "supported" && result.quote && result.page != null) ok("real check", `supported, page ${result.page}, ${v.ms} ms`);
    else warn("real check", v.status === 200 && result ? `got ${result.verdict ?? "no verdict"}; the judge can abstain, retry once before recording` : reason(v));
  } else fail("bluff check", `none of ${tried} bluffs came back contradicted with a quote and a page; the reveal card would have no page proof`);
}

const progress = await call(`/api/game/progress?subjectId=${SAMPLE}`);
if (progress.status === 200 && progress.json?.progress) ok("progress", `${progress.ms} ms, stored: ${progress.json.persisted === true}`);
else fail("progress", reason(progress));

for (const [path, required] of [["/", true], ["/run/new", true], ["/privacy", false], ["/terms", false]]) {
  const res = await call(path);
  if (res.status === 200) ok(`page ${path}`, `${res.ms} ms`);
  else if (required) fail(`page ${path}`, res.error ?? `HTTP ${res.status}`);
  else warn(`page ${path}`, res.error ?? `HTTP ${res.status}; the deployed build may be older than the branch you recorded against`);
}

console.log(`Target: ${base}`);
console.log(lines.join("\n"));
if (blockers.length === 0) {
  console.log(`\nGO${warnings.length ? ` (${warnings.length} warning${warnings.length === 1 ? "" : "s"})` : ""}`);
  process.exit(0);
}
console.log(`\nNO-GO: ${blockers.length} blocker${blockers.length === 1 ? "" : "s"}`);
for (const b of blockers) console.log(`  - ${b}`);
process.exit(1);
