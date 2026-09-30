# Play screens: visual and behaviour review

Driven through the real app (dev server, port 3241, file store, real tool route and grader) with one Chromium at a time.
Commands: `BASE_URL=http://localhost:3241 node scripts/shoot-play.mjs`, `node scripts/axe-play.mjs`, `node scripts/states-play.mjs`.
PNGs are in `docs/evidence/visual/play/` (widths 390, 768, 1440). The mid-run map is drawn from progress seeded into localStorage under the key the app writes (`aloud.progress.<runId>`), because reaching level 6 by play takes several minutes. Play, result and reveal states are reached by playing typed rounds against the real grader.

## What was looked at and what changed

Pass 1 (390 px, read from the PNGs):
- Map: the fixed Continue button sat under the app tab bar. Fixed: it now clears the 57 px bar below 768 px.
- Play: the round pips stretched a grid row and left a 60 to 100 px gap above the combo meter. Fixed with the grid row template.
- Play header: the world name ran to three lines. Fixed: one line with an ellipsis.
- Proofs: the date wrapped mid-number ("9/29/202 / 6"). Fixed: nowrap plus wrapping footer.
- Profile: the daily-goal select clipped its arrow. Fixed with padding.
- Catch round: the proof sheet covered the reveal card. Fixed: catch rounds show the page line inside the reveal card and keep the sheet for say rounds.
- Result: the page stayed scrolled to the bottom after the last round. Fixed: it scrolls to the top on mount.
- Desktop map: the sticky rail sat under the site header. Fixed: `top: 88px`.
- Console: two React warnings (`textDecoration` mixed with `textDecorationThickness`) from the tab bar in `AppShell.tsx`. Fixed with `textDecorationLine`.
- Reduced motion: 14 elements kept an animation name with the OS preference on. Fixed: 0 after the change (`states-play.mjs`).

Pass 2 (all three widths): no horizontal overflow at 390, 768 or 1440 on any shot (`overflow:false` in every line of the run). Console errors on the last full run: 0 from the game screens.

## Measured

- Click on "Check my answer" to the "Checking your page" label: 68 to 144 ms in 8 of 9 rounds, 385 ms once (dev server, first grade after a route compile).
- Click on "Check my answer" to the round result (real grader): 1.7 to 6.4 s. The result cannot arrive inside 300 ms because the grader is a model call; the label, the disabled button and `aria-busy` appear inside 150 ms.
- Tap on "That is true" (catch round, claim read for 2.5 s first) to the reveal card: 81, 104, 107, 113, 145, 160 ms. The page check of the claim runs while the player reads it.
- axe-core (wcag2a, wcag2aa, wcag21aa) on `/run/new`, `/run/<id>`, two play screens, `/proofs`, `/me` at 390 px: 0 violations.
- Keyboard only: focus lands in the answer box each round; typing and Ctrl+Enter resolved a round with no pointer.
- Mic blocked (getUserMedia rejected): the screen says "The browser refused microphone access", offers "Play by typing" and "Try the microphone again"; choosing typing starts the level.
- API down with a kept run: the map opens from the copy in localStorage and shows the note.

## Not verified

- The voice path with a real microphone and the AssemblyAI socket. The play loop over the real `openOralSocket` client is tested with a fake WebSocket (`tests/game-level-flow.test.ts`: win, loss by hearts, voice catch, missed bluff, no close without a page check). The orb is drawn from `MicHandle.levels()`, the same analysers the oral exam uses; no shot of it live.
- Sound cues (off by default) were not listened to.
- Crate: the closed and open states were captured (`result-crate-closed-390.png`, `result-crate-open-390.png`); the open state is partly below the fold at 390 px.
- Safari and Firefox were not run.

## Known limits

- Typed catch levels score from the claim's flag and the tap. The correction field is practice and is labelled "not scored".
- The proof sheet and the toast are drawn over the play area on phones; the toast sits under the round pips and over the combo row for 1.9 s.
