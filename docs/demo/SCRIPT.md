# Plan A: one real take, real microphone

One take by Vaibhav on a real microphone, screen recorded, about 3:00. Everything on screen is the product running. The examiner's voice and tool calls come from a live AssemblyAI Voice Agent session. The sample course is a set of Transformers notes written for this project, and the video says so.

Human time: about 15 minutes, including one retake and reading the sample notes once. Run the preflight first: `node scripts/demo-preflight.mjs --base <your deployment>`. Record only on GO. The preflight prints the name of a Catch it level whose bluff the page check proves. Use that level for the Catch it scene, because 4 of the 11 bluffs in the sample run come back without a page proof (`docs/evidence/probes/game-claims-live.2026-09-30.json`).

Read the sample notes before the take. You cannot catch a bluff you do not know is one. Open the run map, start level 1, and use **Peek at the page** to read the twelve passages, or read `src/lib/courses/transformers.ts`. The facts the game alters are numbers, antonyms, negations and swapped terms.

Rules for the take:

- Say the lines in your own rhythm. The words in quotation marks are the ones that matter.
- The examiner is a live model. Its wording changes on every run. What must happen is listed under "Must happen". If it does not happen, stop and retake. Do not edit around it.
- Which claims in a Catch it level are bluffs is fixed by the run, but which one comes first can differ by level. Judge each claim on its merits. If the first claim is true, tap **That is true** and say so. Keep going until you catch a bluff. If a whole level gives you no bluff to catch, that is a bug: stop and report it.
- Do not narrate what the screen does not show. Say "checking your page" only when the screen says it.
- Do not claim it adapts, remembers you or plans tomorrow. Say only what is on screen: hearts, XP, stars, the proof card, the streak and rank on the map.
- This is a game you score on the page, not against a model's opinion. If you say "the examiner lied", say it about the bluff claim the screen labels after the reveal.

## Storyboard

| Time | Screen | You say | Must happen |
|---|---|---|---|
| 0:00 to 0:15 | The front page at `/`, waveform moving. | "Aloud is a study game you play by talking. You drop your notes, it builds levels, and in one kind of level the examiner lies to you." | Speak to the page, unhurried. The headline "Learn it by saying it" is on screen. |
| 0:15 to 0:35 | Press **Start the sample run**. The build screen shows progress, then the run map. | "This is the sample run: my own Transformers notes. Twenty-two levels, five worlds, each ending in a boss." | The map shows 22 levels in 5 worlds and a Continue button. Hearts, streak and rank are visible. |
| 0:35 to 1:15 | Start the first Say it level. Press **Start talking**, allow the microphone, and answer aloud. | Read the question on the card, then answer it in your own words from the notes, about 15 seconds. | The orb moves with your voice. The examiner responds. The screen shows "Checking your page", then a verdict, XP, and a page line. Do not claim it adapted. |
| 1:15 to 2:00 | Start the Catch it level the preflight named (for example "Bluff check: Queries, Keys, Values" if it names that one). The examiner states a claim. | For a true claim: "That one is true." For the bluff: "Catch it. The notes say it the other way round" and then give the correct version aloud. | You catch a bluff and the reveal card names the page, shows the altered words, and pays the bluff bonus. The screen says **Catch it** or **That is true** on the buttons you use. |
| 2:00 to 2:20 | The examiner is mid-sentence on the next claim or question. | About two seconds into its sentence, say clearly: "Wait, say that again." | The examiner's voice stops and the transcript marks the line as cut off. Expect roughly 1.3 to 1.5 s before the service reports your speech (median of 3 synthetic runs, not a measured stop in a browser). If it does not stop, wait for a longer sentence and try once more. |
| 2:20 to 2:45 | Finish the level. The result screen: stars, XP count-up, proof cards, crate. | "Three hearts, stars, and the proof cards are the exact lines from my notes, with the page number. Code checked each quote against the page." | Say the number of stars and the XP that the screen shows, not a number you expect. |
| 2:45 to 3:00 | Back to the map: streak flame, daily ring, rank. Then the front page or slide 8 of the deck. | "It runs on AssemblyAI's Voice Agent API. The measured numbers, the limits and the link are on screen and in the description." Then stay quiet for the last ten seconds while the captions carry the numbers. | Every figure on screen matches `numbers.json`. The captions say the judge set is small and the voice numbers came from a synthetic voice. |

## Numbers to say, and where they come from

| Line | Value | Source |
|---|---|---|
| Session ready | 444 ms median, n=3, 2026-09-29 | `docs/evidence/probes/oral-live-roundtrip.2026-09-29.json` |
| First examiner audio | 958 ms median, n=3, 2026-09-29 | same file |
| Interruption detection | 1286 ms median from the first loud sample to the service reporting speech, n=3; not a measured playback stop | `docs/evidence/probes/oral-live-bargein.2026-09-29.json` |
| Claim check | 54 labelled claims, 0 false supported, 0 false contradicted | `docs/evidence/probes/verify-claim-live-2026-09-29.json` |
| Tests | 1670 passed, 1 skipped, 100 files, 2026-09-30 | `docs/evidence/vitest.2026-09-30.txt` |

The first three rows are from a synthetic learner voice against a local server, not a human in a browser. Say "with a synthetic learner voice" every time you quote them. Do not put them on screen as if the take produced them.

## If it goes wrong

| What you see | What to do |
|---|---|
| Preflight prints NO-GO | Read the reasons. Do not record. Fix or ask for the fix. |
| The reveal card shows no page line after you catch a bluff | Stop. Retake. That is the moment the video exists for. |
| The page check says the material does not settle a claim | The judge abstained. Continue the level; the round outcome still follows the claim's flag. Retake only if it happens on the bluff you wanted to show. |
| No audio, or the microphone is blocked | Allow it in the address bar, or choose **Play by typing** and record that. Say so on camera. |
| The session drops and says it is reconnecting | Let it finish. The service refused a true resume in live runs, so the level continues in a new session. Say "it reconnected" only if the screen says so. |
| Your interruption does not stop the examiner | Try once more on a longer sentence. If it fails twice, do not fake it. Retake. |
| Voice fails entirely on the day | Play the level typed and say so in the first ten seconds. The typed path is real and scored by the same code, and it is labelled as typed. |

## Labels the video must carry

- First seconds and description: "Sample course: Transformers notes written for this project."
- Description: "Examiner audio and all tool calls are from a live AssemblyAI Voice Agent session recorded on <date of the take>. The learner voice is Vaibhav's own, on a real microphone."
- Closing numbers: "Voice numbers measured 29 September 2026, n=3 runs, synthetic learner voice, local server."

## After the take

1. Watch it once with sound off. The captions and the screen must carry it.
2. Check the length: `ffprobe -v error -show_entries format=duration -of csv=p=0 take.mp4`. About 3:00 is the plan. The platform limit is not published, so stay under 5:00.
3. Replace the bracketed examiner cues in `captions.srt` with the exact words from the on-screen transcript of your take, and re-time the cues to the recording.
4. Put the video URL into `docs/SUBMISSION.md`.
