"use client";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { Level, Run, RoundReport, CatchItem } from "@/lib/game/types";
import type { SourceChunk } from "@/lib/types";
import { initialMachine, type OralMachine } from "@/lib/oral/machine";
import { voiceMessage } from "@/lib/audio/messages";
import { levelSessionUrl, sessionEndedView } from "./resume";
import { runLevelTool, runLevelToolStrict, toolFailed, type ToolResult } from "./level-tool";
import { mintVoiceAgentToken, startOralExam, type MicHandle } from "@/components/oral/mic";
import { CONNECT_TIMEOUT_MS } from "@/components/oral/useOralSession";
import { failureViewFor, failureViewFromCode, failureViewFromMessage, stateHint, stateLine, type FailureView } from "@/components/oral/model";
import { mirroredChunks } from "@/components/mirror";
import { initialPlay, playReducer, announceRound } from "./play-model";
import { LevelController, type RoundClosed } from "./level-controller";
import type { CatchReveal, Connection, LevelView, Stance } from "./level-view";
import type { OrbMode } from "./VoiceOrb";
import type { ProofView } from "./PlayParts";
import type { GameSettings } from "./settings";
import { playCue, type Cue } from "./sound";
import { runVoiceTool } from "./voice-tools";
import { END_GRACE_IDLE_MS, END_GRACE_MAX_MS, quietStep } from "./level-quiet";

const SESSION_TIMEOUT_MS = 15_000;
/** A tap on Real or Bluff waits at most this long for the prefetched page check. */
const PREFETCH_WAIT_MS = 1_500;
const ROUND_OPEN_NOTICE = "The game did not catch your answer. Tap Catch it or That is true, or say it again.";

const CUE: Record<RoundReport["outcome"], Cue> = {
  correct: "good",
  bluff_caught: "good",
  partial: "soft",
  skipped: "soft",
  incorrect: "bad",
  bluff_missed: "bad",
};

function orbFor(state: OralMachine["state"], pending: boolean): OrbMode {
  if (pending) return "checking";
  switch (state) {
    case "USER_SPEAKING": return "user";
    case "SPEAKING": return "examiner";
    case "THINKING": return "thinking";
    case "CHECKING_SOURCE": return "checking";
    case "LISTENING": return "listening";
    default: return "idle";
  }
}

async function loadChunks(subjectId: string): Promise<SourceChunk[]> {
  try {
    const res = await fetch(`/api/sources?subject=${encodeURIComponent(subjectId)}`, { cache: "no-store", signal: AbortSignal.timeout(SESSION_TIMEOUT_MS) });
    if (res.ok) {
      const b = (await res.json()) as { chunks?: SourceChunk[] };
      if (b.chunks?.length) return b.chunks;
    }
  } catch {
    /* fall through to the copy this browser kept */
  }
  return mirroredChunks(subjectId);
}

/**
 * One level of play. It owns the reducer, the round controller, the voice
 * session (the same mic, socket and machine the oral exam uses) and the typed
 * path, and returns the one view object the screen draws.
 */
export function useLevelSession({ run, level, settings }: { run: Run; level: Level; settings: GameSettings }): LevelView {
  const subjectId = run.subjectId;
  const [play, dispatch] = useReducer(playReducer, level, initialPlay);
  const [mode, setMode] = useState<"voice" | "typed">(settings.typedOnly ? "typed" : "voice");
  const [connection, setConnection] = useState<Connection>("idle");
  const [machine, setMachine] = useState<OralMachine>(initialMachine);
  const [examinerText, setExaminerText] = useState("");
  const [examinerCut, setExaminerCut] = useState(false);
  const [youText, setYouText] = useState("");
  const [failure, setFailure] = useState<FailureView | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [canSkip, setCanSkip] = useState(false);
  const [stance, setStance] = useState<Stance | null>(null);
  const [reveal, setReveal] = useState<CatchReveal | null>(null);
  const [proofView, setProofView] = useState<ProofView | null>(null);
  const [peekPassageId, setPeekPassageId] = useState<string | null>(null);
  const [resync, setResync] = useState(0);

  const ctl = useRef<LevelController | null>(null);
  const mic = useRef<MicHandle | null>(null);
  const attempt = useRef(0);
  const sessionId = useRef<string | null>(null);
  const reply = useRef("");
  const speechStart = useRef(0);
  const lastState = useRef<OralMachine["state"]>("IDLE" as OralMachine["state"]);
  const prefetch = useRef<Map<number, Promise<ToolResult | null>>>(new Map());
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const playRef = useRef(play);
  playRef.current = play;

  const onClosed = useCallback((c: RoundClosed) => {
    dispatch({ type: "round", report: c.report, now: new Date().toISOString() });
    setPending(false);
    setCanSkip(false);
    setNotice(null);
    setStance(null);
    setPeekPassageId(null);
    playCue(CUE[c.report.outcome], settingsRef.current.sound);
    if (c.item?.type === "catch") setReveal({ item: c.item, outcome: c.report.outcome });
    // A catch round shows its page line in the reveal card; the proof sheet is for say rounds.
    if (c.item?.type !== "catch" && c.report.proof && c.report.outcome !== "incorrect" && c.report.outcome !== "bluff_missed") {
      setProofView({ quote: c.report.proof.quote, page: c.report.proof.page, spans: c.source?.spans });
      playCue("proof", settingsRef.current.sound);
    }
  }, []);

  const makeController = useCallback(async (): Promise<LevelController> => {
    const chunks = await loadChunks(subjectId);
    const c = new LevelController(level, chunks, () => Date.now(), onClosed);
    ctl.current = c;
    return c;
  }, [level, subjectId, onClosed]);

  /* ---- level end: release the microphone and freeze the controller ---- */
  const ended = play.phase === "won" || play.phase === "lost";
  const [examinerDone, setExaminerDone] = useState(false);
  useEffect(() => {
    if (ended) ctl.current?.stop();
  }, [ended]);

  // After the last round the examiner still owes its reveal and closing line. Wait for it to go quiet
  // (busy, then listening) before the session is closed and the result replaces the screen.
  const busySeen = useRef(false);
  const liveVoice = mode === "voice" && connection === "live";
  useEffect(() => {
    if (!ended || !liveVoice) return;
    const step = quietStep(busySeen.current, machine.state);
    busySeen.current = step.busySeen;
    if (step.quiet) setExaminerDone(true);
  }, [ended, liveVoice, machine.state]);
  useEffect(() => {
    if (!ended || !liveVoice) return;
    // The window restarts on every examiner state change, so a slow examiner that is still progressing is not cut.
    const id = setTimeout(() => setExaminerDone(true), busySeen.current ? END_GRACE_MAX_MS : END_GRACE_IDLE_MS);
    return () => clearTimeout(id);
  }, [ended, liveVoice, machine.state]);
  const releaseMic = ended && (!liveVoice || examinerDone);
  useEffect(() => {
    if (!releaseMic) return;
    const handle = mic.current;
    mic.current = null;
    void handle?.stop();
    setConnection("ended");
  }, [releaseMic]);

  useEffect(
    () => () => {
      attempt.current += 1;
      mic.current?.cancel();
      mic.current = null;
    },
    []
  );

  /* ---- typed catch: check the claim against the page while the player reads it ---- */
  const ensurePrefetch = useCallback(
    (c: LevelController) => {
      const it = c.item;
      if (!it || it.type !== "catch" || prefetch.current.has(c.index)) return;
      const idx = c.index;
      const claim = (it as CatchItem).claim;
      prefetch.current.set(
        idx,
        runLevelTool("verify_claim", { claim, concept: it.conceptId }, `pre_${level.id}_${idx}`, { subjectId, levelId: level.id, sessionId: sessionId.current }).catch(() => null)
      );
    },
    [level.id, subjectId]
  );

  useEffect(() => {
    const c = ctl.current;
    if (c && play.phase === "live") ensurePrefetch(c);
  }, [play.phase, play.roundIndex, ensurePrefetch]);

  /** Wait (briefly) for the page check of the claim on screen and put it in the draft. */
  const applyPrefetch = useCallback(async (c: LevelController) => {
    const it = c.item;
    if (!it || it.type !== "catch") return;
    const idx = c.index;
    const pre = prefetch.current.get(idx);
    if (!pre) return;
    const result = await Promise.race([pre, new Promise<null>((r) => setTimeout(() => r(null), PREFETCH_WAIT_MS))]);
    if (c.index !== idx) return;
    // The engine closes a claim round on a stance plus a page check. If the check did not arrive in time, "not_in_material"
    // says so honestly: the round still scores from the flag and the stance, and earns no proof card.
    c.tool("verify_claim", { claim: it.claim, concept: it.conceptId }, result && !toolFailed(result) ? result : { verdict: "not_in_material" });
  }, []);

  /* ---- voice ---- */
  const connectVoice = useCallback(
    async (c: LevelController) => {
      const my = ++attempt.current;
      setFailure(null);
      setConnection("connecting");
      const fail = (view: FailureView) => {
        if (attempt.current !== my) return;
        mic.current?.cancel();
        mic.current = null;
        setFailure(view);
        setConnection("idle");
      };
      try {
        const res = await fetch(levelSessionUrl(subjectId, level.id, c.index), { cache: "no-store", signal: AbortSignal.timeout(SESSION_TIMEOUT_MS) });
        const body = (await res.json().catch(() => null)) as (Record<string, unknown> & { error?: { code?: string; message?: string } }) | null;
        if (attempt.current !== my) return;
        if (!res.ok || typeof body?.system_prompt !== "string") {
          const sentence = body?.error?.message ?? voiceMessage(body?.error?.code ?? "ORAL_UNAVAILABLE");
          return fail({ ...failureViewFromMessage(sentence), title: "The level could not open", cause: "The server could not build the level from your material", actions: ["retry", "type"] });
        }
        const handle = await startOralExam(
          {
            config: {
              // The server adds the level block and the opening line because levelId is sent.
              system_prompt: body.system_prompt,
              greeting: body.greeting as string,
              tools: body.tools as never,
              keyterms: body.keyterms as string[],
              language_codes: body.language_codes as string[],
              transcription_mode: body.transcription_mode as never,
              turn_detection: body.turn_detection as never,
            },
            subjectId,
            onState: (m) => {
              if (attempt.current !== my) return;
              if (m.sessionId) sessionId.current = m.sessionId;
              if (m.state === "USER_SPEAKING" && lastState.current !== "USER_SPEAKING") speechStart.current = Date.now();
              lastState.current = m.state;
              if (m.state === "LISTENING" || m.state === "SPEAKING") setConnection("live");
              setMachine(m);
            },
            onTurn: (turn) => {
              if (turn.speaker === "user") {
                setYouText(turn.text);
                // Catch rounds: the page check for the claim goes in first so the proof is in the draft when the words close the round.
                const idx = c.index;
                const began = speechStart.current;
                void applyPrefetch(c).then(() => c.index === idx && c.speech(turn.text, began));
              } else {
                setExaminerText(turn.text);
                setExaminerCut(!!turn.interrupted);
                reply.current = "";
              }
            },
            onAgentDelta: (word, replyId) => {
              setExaminerCut(false);
              setExaminerText((prev) => {
                if (reply.current !== replyId) {
                  reply.current = replyId;
                  return word;
                }
                return /^[.,!?;:%)\]'"]/.test(word) ? prev + word : `${prev} ${word}`;
              });
            },
            onError: (message) => fail(failureViewFromMessage(message)),
            onNotice: (_m, code) => setNotice(failureViewFromCode(code).message),
            onEnded: () => {
              mic.current?.cancel();
              mic.current = null;
              setConnection("ended");
              // The service closed the session mid-level: say so, and offer to resume at the next round.
              if (attempt.current === my && playRef.current.phase === "live") setFailure(sessionEndedView(c.index, level.rounds));
            },
          },
          {
            getToken: mintVoiceAgentToken,
            runTool: async (name, args, callId) => {
              const result = await runVoiceTool(c, name, args, callId, (n, a, id) => runLevelTool(n, a, id, { subjectId, levelId: level.id, sessionId: sessionId.current }));
              // The examiner asked about a claim the game has no answer for: the buttons are the way to answer it.
              if (result.round === "open" && attempt.current === my) setNotice(ROUND_OPEN_NOTICE);
              return result;
            },
          }
        );
        if (attempt.current !== my) {
          handle.cancel();
          return;
        }
        mic.current = handle;
      } catch (e) {
        fail(failureViewFromMessage(e instanceof Error && e.message ? e.message : voiceMessage("NO_MIC")));
      }
    },
    [subjectId, level.id, level, applyPrefetch]
  );

  // Connect watchdog: token, socket and session.ready carry no timeout of their own.
  useEffect(() => {
    if (connection !== "connecting") return;
    const id = setTimeout(() => {
      mic.current?.cancel();
      mic.current = null;
      attempt.current += 1;
      setFailure(failureViewFor("token_timeout"));
      setConnection("idle");
    }, CONNECT_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [connection]);

  useEffect(() => {
    const c = ctl.current;
    if (resync === 0 || !c || ended || c.index >= level.rounds) return;
    mic.current?.cancel();
    mic.current = null;
    void connectVoice(c);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a tap (resync) reopens the session
  }, [resync]);

  /* ---- actions ---- */
  const startVoice = useCallback(() => {
    setMode("voice");
    void (async () => {
      const c = ctl.current ?? (await makeController());
      dispatch({ type: "start" });
      await connectVoice(c);
    })();
  }, [makeController, connectVoice]);

  const startTyped = useCallback(() => {
    setMode("typed");
    setFailure(null);
    void (async () => {
      const c = ctl.current ?? (await makeController());
      dispatch({ type: "start" });
      ensurePrefetch(c);
    })();
  }, [makeController, ensurePrefetch]);

  const switchToTyped = useCallback(() => {
    attempt.current += 1;
    mic.current?.cancel();
    mic.current = null;
    setConnection("idle");
    setFailure(null);
    setMode("typed");
    void (async () => {
      const c = ctl.current ?? (await makeController());
      if (playRef.current.phase === "ready") dispatch({ type: "start" });
      ensurePrefetch(c);
    })();
  }, [makeController, ensurePrefetch]);

  const submitTyped = useCallback(
    (text: string) => {
      const c = ctl.current;
      const it = c?.item;
      if (!c || !it || it.type !== "say" || pending) return;
      setPending(true);
      setCanSkip(false);
      setNotice(null);
      setYouText(text);
      const idx = c.index;
      const ids = { subjectId, levelId: level.id, sessionId: sessionId.current };
      void (async () => {
        // The verifier supplies the proof, the grader the outcome. The grade goes in last: it closes the round.
        const verify = await runLevelTool("verify_claim", { claim: text, concept: it.conceptId }, `tv_${level.id}_${idx}`, ids).catch(() => null);
        if (c.index !== idx) return;
        if (verify) c.tool("verify_claim", { claim: text, concept: it.conceptId }, verify);
        try {
          const grade = await runLevelToolStrict("grade_my_answer", { question: it.question, answer: text }, `tg_${level.id}_${idx}`, ids);
          if (c.index === idx) c.tool("grade_my_answer", { question: it.question, answer: text }, grade);
        } catch {
          if (c.index !== idx) return;
          setPending(false);
          setCanSkip(true);
          setNotice("That answer could not be checked. Your text is still here. Send it again, or skip this question.");
        }
      })();
    },
    [subjectId, level.id, pending]
  );

  const choose = useCallback(
    (s: Stance) => {
      const c = ctl.current;
      const it = c?.item;
      if (!c || !it || it.type !== "catch" || pending) return;
      setStance(s);
      setPending(true);
      const idx = c.index;
      void applyPrefetch(c).then(() => {
        if (c.index !== idx) return;
        c.choose(s);
        // A tap closes the round on the screen only. The examiner is still waiting on this claim, so a live
        // session is reopened at the next round: the game decides where the level is, the examiner follows.
        if (c.index > idx && mode === "voice" && connection === "live") setResync((n) => n + 1);
      });
    },
    [pending, applyPrefetch, mode, connection]
  );

  /** The typed check failed and the player would rather move on: the round closes as skipped, which scores nothing. */
  const skip = useCallback(() => {
    const c = ctl.current;
    if (!c || pending) return;
    c.skip();
  }, [pending]);

  const noteHint = useCallback(() => {
    ctl.current?.hint();
    dispatch({ type: "hint" });
    const it = ctl.current?.item;
    if (it && it.type === "catch") setPeekPassageId((it as CatchItem).passageId);
  }, []);

  const end = useCallback(() => {
    attempt.current += 1;
    ctl.current?.stop();
    mic.current?.cancel();
    mic.current = null;
  }, []);

  // Stable, so the orb's animation loop is not restarted by every render.
  const readLevels = useCallback(() => mic.current?.levels() ?? { learner: 0, examiner: 0 }, []);

  const view = useMemo<LevelView>(() => {
    const voicePending = mode === "voice" && (machine.state === "THINKING" || machine.state === "CHECKING_SOURCE");
    const idx = play.roundIndex;
    return {
      level,
      subjectId,
      play,
      item: level.items?.[idx] ?? null,
      mode,
      connection,
      orbMode: orbFor(machine.state, pending),
      stateLine: connection === "connecting" ? "Connecting" : stateLine(machine.state, { phase: connection === "live" ? "running" : "idle" }),
      stateHint: connection === "connecting" ? "Opening a session with the voice service." : stateHint(machine.state, connection === "live" ? "running" : "idle"),
      examinerText,
      examinerCut,
      youText,
      readLevels,
      failure,
      notice,
      pending: pending || voicePending,
      canSkip,
      stance,
      reveal,
      proofView,
      peekPassageId,
      examinerDone: !ended || releaseMic,
      announce: play.last ? announceRound(play.last, play.run.hearts) : "",
      actions: {
        startVoice,
        startTyped,
        switchToTyped,
        submitTyped,
        skip,
        choose,
        hint: noteHint,
        peek: noteHint,
        dismissProof: () => setProofView(null),
        dismissReveal: () => {
          ctl.current?.release();
          setReveal(null);
        },
        end,
      },
    };
  }, [level, subjectId, play, mode, connection, machine.state, pending, canSkip, examinerText, examinerCut, youText, failure, notice, stance, reveal, proofView, peekPassageId, ended, releaseMic, readLevels, startVoice, startTyped, switchToTyped, submitTyped, skip, choose, noteHint, end]);

  return view;
}
