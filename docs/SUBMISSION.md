# Submission: lablab.ai AssemblyAI Voice Agent Hackathon

Prepared 2026-09-30 from branch `wt/pack`, cut from `main` at `24868fe`. Every claim below points at a file in this repository or a command that reproduces it. Anything the evidence does not support is left out or marked not done. This file replaces the one written for the previous product, VIVA Oral, whose voice engine Aloud reuses.

## What lablab publishes, and what it does not

Read again on 2026-09-30 from https://lablab.ai/ai-hackathons/assemblyai-voice-agent-hackathon:

- Dates: September 1 to 30, 2026, online. Prize pool: $10,000.
- Submission fields, video length limit, deck requirement, judging criteria, tracks, and the deadline time and timezone: not stated on the page.
- An earlier search summary of other pages mentioned a video under 5 minutes and 300 MB, a public GitHub repository and a live demo URL. That is not from lablab's page. It is used here as a planning limit: the video plan is 3 minutes, the repository is public, the live URL is a placeholder until deployed.

Because the criteria are unpublished, the pack assumes judging on application of the technology, presentation, business value and originality. If lablab publishes others, re-check this file.

## Form fields

### Project title

Aloud

### Tagline

Learn it by saying it.

### Short description

Aloud turns your own notes into a run of 12 to 30 spoken levels, built on AssemblyAI's Voice Agent API. In Catch it levels the examiner states a claim that is real or quietly altered, and you catch the bluff with the page as proof.

### Long description

**The problem.** You can recognise the right answer on the page and still fail to say it aloud. Flashcards and chat-with-your-PDF tools test recognition. Explaining out loud tests whether you know it, and it is hard to keep doing alone because nothing pushes back.

**What it is.** A study game you play by talking. You drop notes (PDF, text, paste) or start the sample run. Aloud builds a run of 12 to 30 levels from the material, grouped into worlds of about five levels that each end in a boss. The sample run has 22 levels in 5 worlds (10 Say it, 7 Catch it, 5 Boss) and is the same every time it is built.

**The four kinds of level.** Say it: you explain a concept, the examiner follows up, and your answer is graded against your own pages. Catch it: the examiner states a claim from your notes. Half are real. Half are a trap from the course or a page sentence with one fact altered (a number, an antonym, a negation, a swap). You call real or bluff and the page line is shown as proof. Boss: a mixed round at the end of each world with 4 hearts. Recall: concepts you missed come back as a level.

**The game around it.** Three hearts per level, XP with a combo multiplier, up to three stars, ranks 1 to 30, a daily streak with freezes earned every seven days, and a daily minutes ring. Verified quotes become proof cards you collect. The rules are pure functions in `src/lib/game/scoring.ts` and `progress.ts`, tested.

**Why the quote can be trusted.** A language model proposes a verdict on a claim. Code decides whether the quote is allowed: it is accepted only if every piece of it is an exact substring of the page the model named, in order, after whitespace is normalised. A fabricated or altered quote is downgraded to "not in the material". A bluff claim is kept in a run only if that same guard can back a contradiction for it. Round outcomes come from tool results and the claim's stored flag. No function reads the examiner's prose.

**Voice.** The examiner is the AssemblyAI Voice Agent API, opened from the browser with a short-lived token. It uses native turn detection, calls three tools on the server, and stops mid-sentence when you interrupt. Every level can also be typed.

**What it does not do yet.** The game loop has not been played by voice with a human microphone in a browser, and there is no live probe of it in the repository. The voice engine numbers below come from the engine before the game layer, with a synthetic learner voice. See the limits.

**Who it is for, and who it is not.** For students revising from their own text notes who want to rehearse explaining out loud. Not for scans without a text layer, not a check on whether your notes are right, and not a substitute for an examiner's marking.

### Tracks and tags

lablab tracks are not published. Suggested tags: AssemblyAI, Voice Agent API, voice agents, education, game, tool calling, Next.js, TypeScript.

### Links

| Field | Value |
|---|---|
| Live URL | `[LIVE_URL]` Not deployed as of 2026-09-30. Deploy from `main`, then run `node scripts/demo-preflight.mjs --base <url>`. |
| Repository | https://github.com/vaibhav4046/aloud (must be pushed and public before submitting) |
| Video | `[VIDEO_URL]` Set after the take is uploaded. |
| Deck | `docs/deck/aloud.pdf` (nine slides, built from `docs/deck/index.html`) |

## How the AssemblyAI Voice Agent API is used

| Piece | What Aloud does | File |
|---|---|---|
| Voice Agent API | The browser opens a WebSocket to the Voice Agent endpoint and streams 24 kHz PCM16 microphone audio. The examiner's speech returns as `reply.audio` frames. | `src/lib/oral/socket.ts`, `src/components/oral/mic.ts` |
| Token flow | `GET /api/voice-agent/token` calls AssemblyAI's token endpoint with the account key and returns a token that lives at most 600 seconds. The browser holds only that token, and a new one is requested for every connection attempt. The key is read in one server route and appears in no client file (a test scans for it). | `src/app/api/voice-agent/token/route.ts`, `tests/oral-security.test.ts` |
| Session configuration | The first frame is `session.update` with the versioned examiner prompt, three tools, key terms from the subject's concept names, and for a game level a level block appended to the prompt. `GET /api/oral/session?subjectId=&levelId=` builds it from the caller's own stored run. | `src/app/api/oral/session/route.ts`, `src/lib/oral/prompt.ts` |
| Native turn detection | Only fields the turn-detection reference documents are sent: `vad_threshold` 0.6, `interrupt_response` true, `interruption_delay`. An earlier version sent undocumented names that the service accepted and ignored; live probing found that. | `src/app/api/oral/session/route.ts` |
| Tool calling | `search_my_material`, `verify_claim` and `grade_my_answer` go to the agent with `execution_mode: hold`. A `tool.call` becomes `POST /api/oral/tool` with the caller's cookie and the level id. The result is sent back as `tool.result` only when `reply.done` is the latest event. On a level's own catch claim the route still checks the claim but does not write the examiner's statement into the player's mastery map. | `src/lib/oral/tools.ts`, `src/app/api/oral/tool/route.ts`, `src/lib/oral/machine.ts` |
| Barge-in | On `input.speech.started` the client flushes playback and drops audio that arrives after the flush. On `reply.done` with status `interrupted` it discards any pending tool result. | `src/lib/oral/socket.ts`, `src/lib/oral/machine.ts` |
| Reconnect | After a drop the client tries `session.resume`. In both live trials the service refused it (`session_not_found`), and the client continued in a new session carrying the recent turns. | `docs/evidence/probes/oral-live-resume.2026-09-29.json` |
| Game adapter | `src/lib/game/session.ts` turns tool results and the player's stance into a round outcome. | `src/lib/game/session.ts`, `docs/notes/engine.md` |

## Measured numbers

Voice engine rows: live sessions against the real AssemblyAI Voice Agent API on 2026-09-29. The learner is a synthetic voice (Windows System.Speech WAV files in `fixtures/audio`) played through a Node client that runs the same `socket.ts` as the browser, against a local server on port 3101. No browser, no human microphone. Medians of n runs. Values are in `numbers.json`.

| Measure | Median | n | Evidence |
|---|---|---|---|
| Session ready after connect | 444 ms | 3 | `docs/evidence/probes/oral-live-roundtrip.2026-09-29.json` |
| First examiner audio | 958 ms | 3 | same file |
| Tool round trip (`tool.call` to `tool.result`, the whole HTTP call to `/api/oral/tool`) | 2470 ms | 3 | same file |
| Barge-in detection: first loud learner sample to the service reporting speech (values 1286, 1768, 1214) | 1286 ms | 3 | `docs/evidence/probes/oral-live-bargein.2026-09-29.json` |
| Same, with a tool in flight (values 1739, 1456, 1316) | 1456 ms | 3 | `docs/evidence/probes/oral-live-bargein_tool.2026-09-29.json` |
| Continuation after a socket drop: drop to `session.ready` on a fresh session | 986 ms | 2 | `docs/evidence/probes/oral-live-resume.2026-09-29.json` |
| `verify_claim` over a labelled set: 0 false supported, 0 false contradicted; supported precision 1.0 and recall 1.0 (19 of 19); contradicted precision 1.0 and recall 0.889 (24 of 27, the three misses abstained) | 54 claims, 2 courses | 54 | `docs/evidence/probes/verify-claim-live-2026-09-29.json` |
| `verify_claim` judge latency | median 590 ms, p95 2067 ms | 53 model calls | same file |

The 1.3 to 1.5 s barge-in figure is detection latency. The probe's playback is a stub, so it does not measure how long audio takes to go silent in a browser.

Game screen rows: Chromium driven through typed rounds against a local dev server, real grader, file store, 2026-09-30 (`docs/evidence/visual/REVIEW-play.md`). Click on "Check my answer" to the round result: 1.7 to 6.4 s over 9 rounds (a model call), with the busy label inside 150 ms. Tap on a catch claim to the reveal card: 81, 104, 107, 113, 145 and 160 ms (6 taps). axe-core wcag2a, wcag2aa and wcag21aa: 0 violations on 6 screens at 390 px.

Test suite, 2026-09-30, `npx vitest run`: 1670 passed, 1 skipped, 100 files (`docs/evidence/vitest.2026-09-30.txt`).

## Verified live, and unit-tested only

| Behaviour | Live against AssemblyAI or the model provider | Unit-tested |
|---|---|---|
| Handshake, session ready, first audio | yes, n=3, synthetic learner, Node client | yes |
| Tool round trip with a spoken citation and page | yes, 3 of 3 | yes |
| Barge-in flush, stale audio dropped | yes, 6 of 6 | yes |
| Pending tool result discarded on interruption | no; the live probe failed 3 of 3 and is kept as a negative result (`oral-live-interrupt-during-pending-tool-negative.2026-09-29.json`) | yes |
| Reconnect after a drop | yes, 2 of 2, as a new session with history | yes |
| `verify_claim` accuracy on 54 labelled claims | yes | replay of recorded decisions |
| Run generation, 12 to 30 levels on 26 subjects | n/a | yes (`tests/game-run.test.ts`) |
| Hearts, XP, combo, stars, rank, streak, freezes, progress merge | n/a | yes (`tests/game-scoring.test.ts`, `tests/game-progress.test.ts`) |
| Page proof on the sample run's Catch it claims: 8 of 8 real supported, 7 of 11 bluffs contradicted with quote and page, 3 not in material, 1 wrongly supported (n=19, 2026-09-30, `docs/evidence/probes/game-claims-live.2026-09-30.json`) | yes, local server, real judge | n/a |
| Level prompt and round outcomes from tool results | not run live | yes (`tests/game-level-prompt.test.ts`, `tests/game-session.test.ts`) |
| Level played over the Voice Agent socket | not run live; see below | yes, fake socket (`tests/game-level-flow.test.ts`) |
| Typed level in a real browser with the real grader | yes, local, 2026-09-30 | yes |
| Level by voice with a human microphone in a browser | not done | n/a |
| Live deployment | not done | n/a |

Live verification of the new game loop by voice: not yet verified as of this commit (no `aloud-*.json` probe was committed when this file was written).

## Known limits

- The game loop has not been played by voice with a human microphone in a browser. The take is the first such run.
- Typed Catch it rounds score from the claim's flag and the tap. The correction field is practice and is labelled not scored.
- Claim verification is quote-checked and the judge model can still be wrong. Code guarantees the quoted words are in the named page, not that the verdict is right. The labelled set has 54 claims over two courses, written in this repository, with no recorded tuning and test split. Read 0 false supported on 54 as a small result, not a rate.
- The judge on 2026-09-29 was `openai/gpt-oss-120b` through a chain of model providers. Passage text is sent to the providers in the configured chain. `docs/evidence/data-inventory.md` lists where the chain is set.
- Not every bluff gets a page proof. On the sample run 4 of 11 bluffs did not: the judge could not place 3 in the notes and called 1 supported (`game-claims-live.2026-09-30.json`). A round is still scored from the claim's flag, so the player loses the proof line and not points. The preflight names a catch level whose bluff is proven.
- A catch level's prompt names which claims are bluffs and reaches the browser with the rest of the prompt. A player who reads it spoils their own game. Scoring trusts the flag in the stored run, not the model, so no score changes.
- Barge-in takes 1.3 to 1.5 s from the learner's first word to the service reporting speech. The time to real silence in a browser was not measured. Discarding a pending tool result on interruption is unit-tested only.
- Reconnect is a new session with the recent turns. The service refused `session.resume` in every live trial.
- Recall levels, freezes across real days and crates are unit-tested. They were not watched across real days.
- Storage: without `DATABASE_URL` the store is a file on the server's temporary disk and is wiped on restart. Progress is also kept in the browser, so a reload keeps it on that device.
- Chromium only. No Firefox, Safari or physical phone pass. Sound cues are off by default and were not listened to.
- Text only: a scan with no text layer gives Aloud nothing to quote.
- Legal pages are drafts marked for review. The privacy page does not yet list the browser keys the game writes (`aloud.run.*`, `aloud.progress.*`). The security contact in `SECURITY.md` is a placeholder.
- The sample course is a set of Transformers notes written for this project, and is labelled as such where it is shown.

## Removed or downgraded from the previous submission text

- Front page performance figures (139.5 KB gzip JS, LCP 1080 ms) and the 13 route axe run: measured on the previous product's pages, not on the Aloud front page. Removed until re-measured.
- The design-rule audit ("0 failing findings"): re-run on 2026-09-30 it reports failures on the game components (55 errors), so the claim is removed.
- The production URL of the previous product: it serves that product, not Aloud.
- The debrief and "tomorrow's plan" wording: not part of the game screens. Dropped from the copy.

## Human checklist

Full steps and minutes are in `docs/HUMAN-TODO.md`. In order:

1. Merge `wt/pack` and the other worker branches into `main` and push (coordinator).
2. Import the repository on Vercel or `vercel login`, add the environment variable names listed in `docs/HUMAN-TODO.md`, deploy from `main`.
3. `node scripts/demo-preflight.mjs --base <url>` prints GO.
4. Record the take from `docs/demo/SCRIPT.md`, fill `docs/demo/captions.srt`, upload the video.
5. Put the live URL and the video URL into this file, replacing `[LIVE_URL]` and `[VIDEO_URL]`.
6. On lablab: paste the fields above, attach `docs/deck/aloud.pdf`, and press Submit yourself.
