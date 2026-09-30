# Video upload text

Exact text for the video host. Paste as written. Fill `[LIVE_URL]` after the deploy.

## Title

Aloud: learn it by saying it (demo with a synthetic learner voice and a live examiner)

## Description

Aloud turns your notes into a game you play by talking. This demo plays two levels of the sample run against a live voice examiner. In Say it, you explain a concept out loud, the examiner grades the answer against your pages, and the verified page quote becomes a proof card. In Catch it, the examiner states claims from the notes and one of them is planted: you say which.

Learner voice is synthetic. Examiner audio and tool calls are from a live AssemblyAI Voice Agent session recorded on 2026-09-30.

What is real in this video:
- The screen is the running app in Chromium (no mockups): landing page, sample run build, map, two levels, results, map again.
- The examiner's voice is the audio the AssemblyAI Voice Agent returned in that session, captured as the page played it. Nothing was re-synthesised.
- The tool calls (grade_my_answer, verify_claim) ran against the app's real routes and the sample course notes. The proof card and the page quotes come from those results.
- The XP, stars, rank and streak on screen are the app's own values from that run.

What is not real, and how the video was made:
- The learner is not a human. Each spoken answer is a Windows text-to-speech clip played into the page through a virtual microphone, so the app hears it exactly as it hears a microphone. The spoken text of every clip is in fixtures/audio/live/ in the repository.
- The sample course is a labelled set of notes on transformers written for the demo.
- Edits: loading time is cut and silent waits longer than 1.5 seconds are shortened. No spoken word is removed. Captions normalise punctuation only.
- The speech recogniser is not deterministic. Takes in which it misheard the synthetic learner's bluff call (heard "That is true") were discarded and the run was recorded again, never edited. Take log for 2026-09-30, desktop clip: six recordings. One was discarded because the recogniser misheard the bluff call, one because the Say it answer was graded incorrect and the level was lost, and three good runs were discarded and re-recorded to change how long the answer cards stay on screen. Take six is the one shown. The phone clip is take four of four.
- A 390 by 844 phone-size clip of the Say it level is included as demo-mobile.mp4.

Numbers on screen are from this one run. They are not a benchmark. Examiner wording changes on every run.

Code: https://github.com/vaibhav4046/aloud
Live app: [LIVE_URL]
Recorded on 2026-09-30. Re-record with `node scripts/record-demo.mjs`.

## Files

| File | What it is |
|---|---|
| demo.mp4 | 1280 by 720, H.264, AAC, captions burned in. Upload this. |
| demo.webm | Same cut, VP9 and Opus. |
| demo.srt | Captions as a separate track, same cues as the burned-in text. |
| demo-mobile.mp4 | 780 by 2088 (phone frame doubled, caption strip below), Say it level only. |
| VOICEOVER.md | Optional lines for a human voice, timed, with the windows to keep clear. |
