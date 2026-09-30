# ALOUD design brief (single source of truth for all game workers)

Product: **Aloud**. Tagline: "Learn it by saying it." Cloned from the VIVA voice examiner engine (AssemblyAI Voice Agent, source-grounded claim checking, mastery, retrieval). New GitHub repo vaibhav4046/aloud, new theme, new front end. It is entered in the lablab AssemblyAI Voice Agent Hackathon (closes 2026-09-30). The owner's brief: it must not feel like an existing study app. It is a GAME of learning, engaging, built on real human psychology, with a front end in the style of Wispr Flow's website and the motion-rich craft of motionsites.ai. "Brutally good."

## The loop
1. Drop your notes (PDF, text, paste) or pick the sample course.
2. Aloud builds a **Run** of 12 to 30 levels from the material (30 when the material is rich, never padding: min 12). Levels are grouped in **Worlds** (chapters of about 5 levels, each ends with a Boss).
3. Play a level by talking (typed fallback always available). Four kinds:
   - **Say it**: explain a concept; the examiner asks follow-ups; graded against your pages.
   - **Catch it (Spot the Bluff)**: the examiner states a claim from your material. Half are real, half are plausible traps (from the course traps or a deliberately altered fact). You catch the bluff and correct it, or confirm the truth. The differentiator: the AI lies to you and you must catch it, with the page as proof.
   - **Boss**: rapid oral round across the whole world, interruptions on, 4 hearts.
   - **Recall**: auto-inserted review of concepts you missed earlier (spaced repetition made into a level).
4. Verified quotes become **Proof cards** you collect (verbatim quote checked by code against your page: this is the trust mechanic and the collection loop).

## Game rules (scoring.ts implements exactly these, pure and tested)
- Hearts: 3 per level (Boss 4). Incorrect answer or missed bluff costs 1. Zero hearts = level lost, retry free.
- XP per round: correct 100, partial 50, bluff_caught 150, grounded bonus +25 (checked against a page), combo multiplier x1.0, x1.2 (3 in a row), x1.5 (5), x2 (8), resets on a miss. Boss rounds x1.5.
- Stars: 3 = all rounds not incorrect and at most 1 partial, 2 = at most 1 heart lost, 1 = won. Levels unlock in order; a level needs 1 star to unlock the next.
- Rank 1..30 from cumulative XP (smooth curve, each rank about 8% more XP than the last, first rank at 300 XP).
- Streak: finishing at least one level per local day; missing a day breaks it unless a freeze (earned every 7 days) is auto-spent.
- Daily goal: default 10 minutes; a ring fills as you play.

## Psychology used (each must be visible in the UI, not just claimed)
goal-gradient (world progress bars accelerate near the end), endowed progress (level 1 starts pre-credited), competence and mastery feedback (stars, rank, per-concept mastery), variable reward (a random encouraging "crate" after some levels: a fact from the player's own material, a freeze, or XP boost), loss aversion (streak flame with a visible freeze), spaced repetition (Recall levels), autonomy (choose typed or voice, choose next available level, replay for stars), immediate feedback (sound and animation within 300 ms of an answer), progressive challenge (difficulty 1 to 5 across the run, hints cost a heart-free penalty), curiosity gap (locked levels show a blurred blurb of the concept). No fake social proof, no invented user counts, no dark patterns (no guilt copy).

## Voice
The examiner persona per level kind is played by the AssemblyAI Voice Agent (src/lib/oral). Barge-in, tool calls (search_my_material, verify_claim, grade_my_answer), state machine and diagnostics stay as they are. Level context (kind, concept focus, round count, hearts) is passed via the session config prompt; the game screen listens to machine events + tool results to produce RoundReports. Never fabricate a verdict: outcomes come from tool results.

## Look and feel (Wispr Flow website language, plus motionsites-style motion)
Airy, calm, confident. Large soft type, generous whitespace, warm off-white canvas with a soft pastel color wash that shifts gently, huge rounded cards, pill buttons, a live voice waveform as the hero object, scroll-linked motion, layered parallax cards, subtle grain, smooth easing, micro-interactions on every control. NOT the previous "Examiner's table" paper look and NOT a dark neon gamer look. Mascot-free. Sound design optional and OFF by default (respect autoplay). Fonts self-hosted through next/font (choose a distinctive display serif or grotesk plus a clean UI sans; not Inter/Geist/Space Grotesk). Reduced-motion must keep everything usable. Mobile first: the map and play screen are designed for a phone in one hand.
Reference sites to study with WebFetch/WebSearch (the motionsites MCP needs auth and is unavailable): https://motionsites.ai and https://wisprflow.ai. Extract layout rhythm, section structure, motion patterns; do not copy assets, text or logos.

## Screens
Landing (Wispr-style, waveform hero, "Drop your notes. Play it out loud.", how it works in 3 steps as scroll scenes, the Bluff mechanic explained with a live mini-demo, psychology-backed features shown by function, honest limits, CTA "Start the sample run" and "Upload your notes"), Upload/build screen (animated "building your run" with real progress: extraction, concepts found, levels generated), Run map (winding path of level nodes across Worlds, stars, locks, current node pulse, streak flame, daily ring, rank), Level play (big prompt card, voice orb/waveform driven by real mic RMS, hearts, combo meter, live captions, typed fallback, source peek on demand, page-proof reveal animation), Result (stars burst, XP count-up, proof cards earned, next-level CTA, crate), Proofs (collection of proof cards with page numbers), Profile/streak, Settings (sound, reduced motion, daily goal), plus /privacy /terms /accessibility /about kept.

## Engineering contract
Types: src/lib/game/types.ts (committed). Modules: run.ts (generateRun(subject) pure and deterministic, tested: 12..30 levels, worlds of about 5, boss every world end, recall inserted where earlier misses exist, difficulty ramps), scoring.ts (pure), progress.ts (persist to localStorage on the client and to the existing store per identity when durable; merge rules; streak logic with an injectable clock), session.ts (adapts the oral session to a level: builds the level prompt and turns tool results into RoundReports). API: GET/POST /api/game/run?subjectId=, GET/POST /api/game/progress. Keep all engine tests green; delete tests of removed pages only.

## Rules for every worker
Repo: D:\project\aloud (branch main). Each worker uses its own git worktree D:\project\aloud-wt\<name> (branch wt/<name>) created from main; node_modules: run `npm ci` (real, no junction; Turbopack rejects junctions) or copy from D:\project\aloud\node_modules with robocopy /E. COMMIT OFTEN (`git commit -F file`, NO Co-Authored-By/tool attribution lines, no em/en dashes anywhere in code, copy or docs). Never print or commit secrets (.env.local names only). Never push or merge to main; the coordinator merges. One Chromium at a time; no `next build` except at milestones. Read D:\project\.hackathon\AGENT-RULES.md for the Windows notes. No fabricated numbers, users, testimonials or logos anywhere.
