# Decisions

Dated entries, newest last. Each says what was chosen, what it was scored against, and why.

## 2026-09-29: the typed path on /oral

Options scored on: works with no microphone, verified against the live service, size of change to code owned by another stream.

| Option | No mic | Verified | Size |
|---|---|---|---|
| A. Send the typed text into the open Voice Agent socket as a `conversation.message` | no, needs a session | not verified live; the reference says it injects context, not that it triggers a reply | edits socket.ts |
| B. Typed exam on the existing quiz endpoints (`/api/exam/start`, `/api/exam/answer`) | yes | endpoints already tested and used by `/exam` | one component |
| C. Both | yes | half | both |

Chosen: B. It covers a denied microphone, no device, an insecure page and a learner who prefers typing, and every graded answer becomes a debrief entry. Choosing Type instead during a live exam ends the voice session first. A is left out until a live probe shows the service replies to injected text.

## 2026-09-29: where the diagnostics numbers come from

`?diag=1` sets `globalThis.__VIVA_ORAL_TRACE__` before the socket opens; the socket already writes event names and `performance.now()` stamps there. The drawer derives every number from that array (`src/components/oral/diag.ts`, tested against a scripted trace). No number is stored or prefilled, and the socket needed no change for this. Barge-in is labelled "speech-started event to playback flushed" because that is the interval the client can measure; it does not include the service's own detection time.

## 2026-09-29: start and stop shortcut

Alt+Shift+M. Space is not usable (it belongs to focused buttons and page scroll, see `src/lib/audio/shortcut.ts`), a single letter would break WCAG 2.1.4, and Ctrl+Shift+Space belongs to another app on this owner's machine. A chord with Alt and Shift does not collide with a browser or screen reader shortcut on Windows, macOS or Linux in the browsers tested. It is shown in the controls bar and hidden on coarse pointers.

## 2026-09-29: live captions

The examiner line appears word by word from `transcript.agent.delta` (one word per event per the events reference), then is replaced by the final `transcript.agent` text. This needed one forwarding line in `src/lib/oral/socket.ts` (`onAgentDelta`). Partial learner transcript deltas are shown in the "You" card and are not announced by any live region.

## 2026-09-30: game screens, where the pieces live

Score, progress, run and session logic come from `src/lib/game` through one file, `src/components/game/engine-port.ts`. The screens hold no rule of their own. Two options were scored for the level flow: (A) a React reducer that re-implements hearts, combo and XP, (B) a reducer that wraps the engine's `LevelRun` and `applyRound`. B was chosen: one source of numbers, and the engine tests cover the rules. `play-model.ts` adds only the last-round feedback, the hint flag and proof cards as they land.

## 2026-09-30: instant feedback in typed catch rounds

The outcome of a catch round depends on the claim's `isBluff` flag and the player's stance, not on the page check, which only supplies the proof card. So the check for the claim on screen (`verify_claim`) starts as soon as the claim is shown, and a tap on Real or Bluff waits at most 1.5 s for it, then closes the round. A tap after the player has read the claim resolves in one frame plus one render. Say rounds need the grader and show "Checking your page" from the click until the tool returns; the measured time from click to result is in `docs/evidence/visual/REVIEW-play.md`.

## 2026-09-30: a peek costs the same as a hint

Opening the page drawer during a round marks the round hinted (half XP, no heart), the same as the Hint button. Reading the answer off the page and being paid in full for it would make the proof cards meaningless. The drawer says so before the player opens it.

## 2026-09-30: icons from lucide-react on the game screens

The earlier design limited the product to six drawn icons. The game needs a lock, hearts, stars, a crown, a crate, a snowflake and a few more, and each one carries meaning a word cannot carry as fast. `lucide-react` was already a dependency and imports per icon, so the bundle grows by the icons used and no new package is added. The six drawn marks stay for the brand and the microphone controls on the older screens.

## 2026-09-30: the result screen is part of the play route

The result replaces the play screen in place instead of navigating, so the stars, the XP count-up and the crate start on the frame the last round resolves and the reveal of the last catch claim is not lost to a route change. A reload of `/play/<level>` starts the level again (a free retry); the stored result lives in progress and shows on the map.


## 2026-09-30: demo video is recorded from live runs, edited only by cutting waits

Two designs were scored. A: scripted mock UI with pre-rendered audio (fast, repeatable, not the product). B: Playwright recordVideo of the real UI against the live Voice Agent, with the examiner PCM tapped from the page and the learner played from Windows System.Speech WAVs. B wins on truth: every pixel, tool call and examiner word is from a real session. It costs about 4.5 minutes of wall time per take and the speech recogniser is not deterministic, so record-demo.mjs discards and re-records a take when the bluff is not caught (exit code 3, up to 4 attempts) or the Say it level is lost.

Edits allowed in render-demo.mjs: cut loading time, shorten silent waits to 1.5 s, never remove a spoken word. Captions are burned from an ASS file built from the same cue list as demo.srt. The learner voice is labelled synthetic in the first caption and in the description. The phone clip pads a caption strip under the 390 by 844 frame so captions never cover the app.
