# Human steps for Aloud

Only Vaibhav can do these: logins, the recording, the upload and the Submit button. Each has the exact command or link and an estimate in minutes. Secrets never go in chat or in a file in this repository.

State when this was written (2026-09-30): the repository https://github.com/vaibhav4046/aloud is public. There is no Aloud deployment. `https://aloud.vercel.app` answers but serves an unrelated site, so it is not this project; do not put it in the form. The Vercel CLI is installed and logged out on this machine. The lablab page does not state the deadline time or timezone. The hackathon window is September 1 to 30, 2026, so treat the end of today as the deadline and submit as early as the steps allow.

| # | Step | Minutes |
|---|---|---|
| H1 | Merge and push (coordinator) | 3 |
| H2 | Deploy: import on Vercel, or `vercel login` and deploy | 10 |
| H3 | Preflight | 2 |
| H4 | Record the take | 15 |
| H5 | Captions and upload the video | 10 |
| H6 | Fill the two URLs into `docs/SUBMISSION.md` | 2 |
| H7 | Submit on lablab | 8 |

Total about 50 minutes.

## H1. Merge and push (coordinator, not the owner)

The worker branches (`wt/pack` and the others) must be merged into `main` and pushed, because the submission links a public repository and the deployment builds from `main`. Then on `main` run `npx vitest run`, `npm run typecheck` and `npm run lint:copy`.

## H2. Deploy (10 minutes)

Option A, in the browser (no CLI login):

1. Open https://vercel.com/new, choose Import Git Repository, pick `vaibhav4046/aloud`, framework Next.js, root directory as is.
2. Before pressing Deploy, open Environment Variables and add the names below. Type the values there. They never go in chat or in a file.
3. Deploy. Copy the production URL.

Option B, CLI:

```
vercel login
vercel whoami
cd D:\project\aloud
vercel env add ASSEMBLYAI_API_KEY production
vercel --prod
```

Environment variable names, from `.env.example` and the code:

| Name | Needed for | If missing |
|---|---|---|
| `ASSEMBLYAI_API_KEY` | token route for the Voice Agent | the voice examiner cannot start; typed play still works |
| `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` | the `verify_claim` judge and the answer grader | no page proof and no grading; every claim comes back "not in the material" |
| `LLM_FALLBACKS` | extra model providers in the failover chain | one provider only |
| `AI_PROVIDER` | provider selection, `openai-compatible` | see `.env.example` |
| `DATABASE_URL` | durable store (Postgres) for runs and progress | the store is a temporary file and resets on restart; progress still lives in the browser. Say so on camera |
| `NEXT_PUBLIC_APP_URL` | absolute URLs in page metadata | metadata points at a default host. Set it to the production URL and redeploy once |
| `MCP_TOKEN_SECRET` | signs assistant pairing keys | only needed if you demo the MCP endpoint, which this submission does not |

The deployment must not have `ALLOW_FIXTURE_IN_PROD` set. If the production URL shows a Vercel login wall, assign the production domain to the project instead of chasing the deployment protection toggle.

## H3. Preflight (2 minutes)

```
cd D:\project\aloud
node scripts/demo-preflight.mjs --base https://YOUR-URL
```

It must print `GO`. It checks health, the model provider, storage, the token mint, the sample run (12 to 30 levels), the level session config, a bluff that the page check proves (it prints the level name to record) and the public pages. `NO-GO` prints the reasons. Do not record on a NO-GO.

## H4. Record the take (15 minutes)

1. Work through `docs/demo/CHECKLIST.md` (ten items, about four minutes).
2. Record from `docs/demo/SCRIPT.md`. One take, real microphone, headphones on. Use the Catch it level the preflight named.
3. Check the length: `ffprobe -v error -show_entries format=duration -of csv=p=0 take.mp4`. About 3:00 is the plan. Stay under 5:00.

## H5. Captions and upload (10 minutes)

1. Open `docs/demo/captions.srt`. Replace each bracketed cue with the exact words from the on-screen transcript of your take and re-time the cues.
2. Upload to YouTube as unlisted, or to the host lablab accepts, with the SRT. The description must say:
   - "Sample course: Transformers notes written for this project."
   - "Examiner audio and all tool calls are from a live AssemblyAI Voice Agent session recorded on <date>. The learner voice is my own, on a real microphone."
   - "Voice numbers were measured on 29 and 30 September 2026 with a synthetic learner voice against a local server."

## H6. Two URLs into the submission text (2 minutes)

In `docs/SUBMISSION.md` replace `[LIVE_URL]` and `[VIDEO_URL]`. Do the same for the README line `Live: [LIVE_URL]`. Commit on `main` with a message file and no attribution lines.

## H7. Submit on lablab (8 minutes)

1. Open https://lablab.ai/ai-hackathons/assemblyai-voice-agent-hackathon, sign in and open your project submission.
2. Paste from `docs/SUBMISSION.md`: title, tagline, short description, long description, tags.
3. Add the live URL, https://github.com/vaibhav4046/aloud, and the video URL.
4. Attach `docs/deck/aloud.pdf` if the form takes slides.
5. Read the form's own required fields and limits. This pack recorded them as unpublished, so anything the form asks that is not in `docs/SUBMISSION.md` is yours to fill honestly.
6. Press Submit yourself.

## Still open, not blocking the submission

- Set a real security contact address in `SECURITY.md` and the legal pages (they hold a placeholder).
- The privacy page does not yet list the browser keys the game writes (`aloud.run.*`, `aloud.progress.*`). Add a sentence before a public launch.
- Rotate any credential that was ever pasted into a chat, a log or a file. This pack did not check for one.
- Leftovers from the earlier product still name its old address: `extension/` (a browser extension that is not part of this submission), the User-Agent string in `src/lib/intake/url.ts`, and `scripts/api-probes/lat.mjs`. None is on the game path. The `viva_did` cookie keeps its old name on purpose so existing browsers keep their identity.
- If the take shows a sound cue or the crate, listen to the cue once first. Sound is off by default and was not listened to by the workers.
