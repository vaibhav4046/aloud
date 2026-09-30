# Third-party software and assets

Aloud itself is under the licence in `LICENSE`. The components below are separate works under their own terms.
Versions are the ones in `package-lock.json` at the time of writing.

## Fonts (self-hosted through next/font, no runtime request to a font CDN)

| Font | Use | Licence |
|---|---|---|
| Fraunces | Display type, headlines and questions | SIL Open Font License 1.1 |
| Onest | Interface text | SIL Open Font License 1.1 |
| IBM Plex Mono | Page numbers, timings, passage ids | SIL Open Font License 1.1 |

## Runtime libraries

| Package | Version | Licence |
|---|---|---|
| next | 16.3.4 | MIT |
| react, react-dom | 19.2.8 | MIT |
| motion | 13.2.0 | MIT |
| zod | 3.25.76 | MIT |
| pg | 8.23.0 | MIT |
| pdf-parse | 2.4.5 | Apache-2.0 |
| lucide-react | 1.45.0 | ISC (icons on the game screens: lock, hearts, stars, crown, crate, microphone) |

## Build and test tooling

| Package | Version | Licence |
|---|---|---|
| tailwindcss, @tailwindcss/postcss | 4.3.3 | MIT |
| typescript | 5.9.3 | Apache-2.0 |
| vitest | 4.1.11 | MIT |
| @playwright/test | 1.63.0 | Apache-2.0 |
| @axe-core/playwright | 4.13.0 | MPL-2.0 |
| tsx | 4.23.13 | MIT |

## Content

The sample course "Transformers, Week 4" and the other shipped courses are VIVA's own notes, written for this
project. Any text seeded from other sources is listed with its licence in `scripts/seed-corpus.mjs`.

## Services

AssemblyAI (the Voice Agent examiner), a model provider chain for grading answers and checking claims, and Vercel (hosting). They are services, not bundled
code. What each one receives is listed on the `/privacy` page.
