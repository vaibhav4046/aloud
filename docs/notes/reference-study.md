# Reference study: what the two reference sites do, and what Aloud takes from them

Sources read on 2026-09-30: https://wisprflow.ai (fetched), https://motionsites.ai (fetched), plus third-party
design extractions of the Wispr Flow site (Refero styles page, Fudge design share) and the public description of
MotionSites lessons and templates. The motionsites MCP needs auth and was not used. Nothing below is copied:
no assets, text, logos or the exact font pairing.

## Wispr Flow (the language we borrow)

Observed and reported by the extractions:

- Type: a large display serif at weight 400, not bold. Authority comes from scale (roughly 64 to 120 px at desktop),
  tight tracking (about -0.03em) and tight leading (0.85 to 1.1). A geometric sans carries body and controls,
  16 to 20 px, leading about 1.3. The serif never appears small.
- Colour: three or four working colours. Warm cream canvas, near-black ink, one soft lavender for the primary
  action, one deep green-teal for dark inner panels, an occasional orange accent. Temperature contrast, not saturation.
- Surfaces: shape does the separating. Panels use 40 px or larger radii, cards 12 to 32 px, controls pill or 12 px.
  Hairline 2 px borders in a slightly darker cream. Very few shadows.
- Spacing: 8 px base unit, about 128 px between major sections, 32 to 40 px inside cards, 1200 px max content width,
  40 px side padding at desktop.
- Structure of the page: floating pill nav, hero with a live "speech becomes clean text" object, a before/after
  example, a proof strip, a speed comparison, three-column feature breakdown, privacy block, FAQ, closing CTA.
- Motion: calm. Text transitions between states, reveal of comparison examples, decorative dotted paths and rotating
  text rings, heavy motion blur on photography. Motion adds life without pace.

## MotionSites (the motion craft we borrow)

- Hero first: a big centered headline with one emphasised word, one obvious button, a moving background object.
- Scroll craft reported in their lessons: staggered fade-up reveals as sections enter the viewport, scroll scrub that
  maps page scroll to an animation timeline (smoothed), sticky hero layers, fixed navbar.
- A library layout: filter pills, grid of uniform cards, one promo module that breaks the grid.
- Their palette is dark and vivid. Aloud does not take that. Only the motion vocabulary transfers.

## What makes both feel the way they do

1. One enormous typographic gesture per screen and everything else small and quiet. The ratio between the
   headline and the body is about 5:1, which reads as confidence.
2. Whitespace is the material. Sections are separated by 96 to 160 px, not by rules or background bands.
3. The colour wash is slow. A pastel field drifts over tens of seconds, never pulses.
4. Rounded everything, but not uniformly: a 999px pill for actions, 28 to 44 px for big surfaces, 14 to 20 px
   for inner tiles. Inner radius is always the outer radius minus the padding.
5. The hero object is alive but not busy. It reacts to input (voice) or idles in a breathing loop.
6. Reveals are short (500 to 700 ms), use a long-tail ease-out, travel 16 to 28 px, and stagger by 60 to 90 ms.
7. Cards overlap and sit at slight angles or different parallax speeds, which gives depth without shadows.

## Decisions for Aloud

- Display face: Fraunces (variable, soft optical sizes, warm and slightly odd), not EB Garamond. UI face: Onest,
  not Figtree, Inter, Geist or Space Grotesk. Mono for page numbers: IBM Plex Mono (already in the app). All
  self-hosted through next/font.
- Canvas warm off-white (#FBF8F2 family). Wash of four pastels (lavender, peach, mint, butter) on a 40 s drift.
  Primary action is a dark ink pill, secondary is a white pill with a hairline. Ink-dark inner panels in a deep
  green-black, used once or twice per page, to give the light pages a weight.
- Radii: 999 pills, 32 px big surfaces, 20 px tiles, 12 px inputs.
- Motion tokens: ease-out-expo for reveals (700 ms), spring for interactive controls, count-up 900 ms, magnetic
  pull limited to 10 px. Every primitive checks `prefers-reduced-motion` and renders the final state.
- Hero object: a real waveform on canvas, idle "breathing" from a sum of sines, optionally driven by the visitor's
  microphone RMS if they choose to allow it. The mic is never requested until the visitor presses the button.
- Not taken: pricing, testimonials, logo strips, invented counts, neon on black.
