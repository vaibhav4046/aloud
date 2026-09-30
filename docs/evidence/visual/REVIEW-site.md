# Site visual review (G-SITE)

Date: 2026-09-30. Chromium via Playwright, one browser at a time, against `next dev` on port 3221.
Screenshots: `docs/evidence/visual/site/pass1/` (first look) and `docs/evidence/visual/site/pass2/` (after fixes).
Command: `MSYS_NO_PATHCONV=1 BASE_URL=http://localhost:3221 node scripts/shoot-site.mjs --pass N --widths 390,768,1440 --paths / /privacy /about`.
Each run writes `<page>-<width>-fold.png` (first viewport), `-full.png` and `-sNN.png` slices of about 1000 px, and prints overflow and console-error counts.
I opened the PNGs with the image reader; the lines below are what I saw, not what the script measured.

## Pass 1 findings

| # | Where | Finding | Fix |
|---|---|---|---|
| 1 | Landing hero 1440 | Headline broke as "Learn it by saying / it." with one orphan word, and an earlier build glued the words together (no spaces between the animated spans). | Spaces moved out of the spans, `text-wrap: balance` and a 12ch measure. Now one line at 1440 and 768, two balanced lines at 390. |
| 2 | Landing bluff panel 1440 | The heading sat in a narrow column and broke into four short lines ("The / examiner / will lie to / you."). | Wider heading measure and its own size clamp. Now three lines at 1440, two at 768. |
| 3 | Landing site footer | Old mono links on a hairline, no relation to the new look. | New footer card: wordmark, links as pills, note. |
| 4 | Landing features 1440 | Tiles were tall with large empty zones (Recall and Crates). | Tile min-height only from 720 px up, art block sized to content. Empty space is reduced, not gone: the Crates and Spaced recall tiles at 1440 still have a visible gap between the small picture and the text. |
| 5 | Oral screen 1440 | The sticky control bar was a flat canvas rectangle cutting across the colour wash. | Translucent white card with the 28 px radius. |
| 6 | Legal pages | Plain text on the wash, ragged against the new surfaces. | Content now sits on one large rounded sheet, display-face h1. |

## Pass 2 findings

| # | Where | Finding | Fix |
|---|---|---|---|
| 7 | Landing nav 768 | The wordmark wrapped to "alou / d" and the links wrapped to "Limit / s". A real bug, only visible at tablet width. | `white-space: nowrap`; the four anchor links now show from 960 px, below that the nav is wordmark plus the start button. Re-shot: clean. |
| 8 | Hero stage idle state | The status dot was red while idle, which reads as "recording". | Grey when idle, red only while the microphone is live. |
| 9 | Bluff demo result | The page tag read "Page 20 · 5 · Optimisation background" (the course section carries a chapter number) and the pill stretched into a blob when it wrapped. | Chapter number stripped in `buildBluffDemo` (unit-tested), tag radius 12 px. |
| 10 | Bluff demo | The sticky nav covered the top of the card after scrolling to it. | `scroll-margin-top: 96px` on the card. |

## Checked and fine (opened the PNGs)

- Landing at 390, 768 and 1440: no horizontal overflow (measured, 0 console errors on each run), waveform draws at every width, both hero buttons visible in the first viewport at 390 (fold height 844).
- Sticky two-column "how it works" at 1440 leaves blank space on the left while the three scenes scroll. Intended (the heading holds), but the blank area is large the first time you see it.
- Privacy and About at 390 and 1440 (terms and accessibility share the same shell and were not opened): sheet has 16 px side gutters on the phone, text at 16 px.
- Link preview image (`/opengraph-image`, 1200x630) renders with the wave and the wash. It uses the renderer's default sans because the site fonts cannot be loaded into it, so it does not match the on-page display face.

## Not done

- No Firefox or Safari pass. Only Chromium was used.
- The subjects and oral screens were only looked at for inherited styling, not redesigned (game screens belong to the other worker).
- No physical phone; 390 px is an emulated viewport with touch enabled.
- Motion quality (the wash drift, reveal timing, the count-up) cannot be judged from still PNGs. Reduced-motion behaviour was checked by script (`scripts/site-drive.mjs`): no reveal block stays hidden and the wash animation is `none`.

## Interaction drive (`node scripts/site-drive.mjs`, output pasted from the run)

- Bluff demo at 390 px: claim 1 answered Bluff shows Caught, page 20 and +175 XP; claim 2 (a true statement) answered Bluff shows one heart lost and the hearts read "2 of 3"; final result "2 bluffs caught, 350 XP".
- Microphone: 0 `getUserMedia` calls before the button is pressed; with the permission denied there is exactly 1 call and the stage says the microphone was blocked.
- Reduced motion: 0 hidden reveal blocks, wash `animation-name` is `none`.
