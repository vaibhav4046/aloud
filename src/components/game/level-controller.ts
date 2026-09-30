import type { Level, LevelItem, RoundReport } from "@/lib/game/types";
import type { SourceChunk } from "@/lib/types";
import {
  beginRound,
  closeRound,
  isRoundReady,
  noteHint,
  noteToolEvent,
  noteUserSpeech,
  setStance,
  type RoundDraft,
  type Stance,
  type ToolEvent,
} from "@/lib/game/session";
import { outcomeOfTool, type SourceCard } from "@/components/oral/model";

/**
 * One level, as a small state machine over the engine's round draft. Voice and
 * typed play feed it the same events (what the player said, which stance they
 * took, what a tool returned) and it emits one RoundReport per finished round.
 * The outcome is decided by the engine from code-checked results, never from
 * model prose. No React and no browser globals here, so the level flow is
 * tested against the real socket client with a fake WebSocket.
 */

export type RoundClosed = {
  report: RoundReport;
  item: LevelItem | null;
  /** The passage card the verifier returned this round, for the proof reveal's highlighted span. */
  source: SourceCard | null;
};

export class LevelController {
  index = 0;
  draft: RoundDraft;
  private source: SourceCard | null = null;
  private done = false;

  constructor(
    readonly level: Level,
    private readonly chunks: SourceChunk[],
    private readonly now: () => number,
    private readonly onClosed: (c: RoundClosed) => void
  ) {
    this.draft = beginRound(level, 0, now());
  }

  get item(): LevelItem | null {
    return this.level.items?.[this.index] ?? null;
  }

  get stance(): Stance | null {
    return this.draft.stance;
  }

  /** What the player said, as a transcript. Catch rounds read the stance from the words. */
  speech(text: string): void {
    if (this.done) return;
    this.draft = noteUserSpeech(this.draft, this.level, text);
    this.tryClose();
  }

  /** The Real or Bluff buttons. */
  choose(stance: Stance): void {
    if (this.done) return;
    this.draft = setStance(this.draft, stance);
    this.tryClose();
  }

  /** A hint or a peek: the round pays half from here on. */
  hint(): void {
    if (this.done) return;
    this.draft = noteHint(this.draft);
  }

  /** A tool result, from the voice agent's call or from a typed submit. */
  tool(name: string, args: Record<string, unknown>, result: Record<string, unknown>, isError = false): void {
    if (this.done) return;
    const ev: ToolEvent = { name, args, result, isError };
    const out = outcomeOfTool(name, args, result, `${this.level.id}:${this.index}`);
    if (out.source) this.source = out.source;
    this.draft = noteToolEvent(this.draft, this.level, ev);
    this.tryClose();
  }

  /** The level ended (won, lost or left): later events are ignored. */
  stop(): void {
    this.done = true;
  }

  private tryClose(): void {
    if (!isRoundReady(this.draft, this.level)) return;
    const report = closeRound(this.draft, this.level, this.chunks, this.now());
    const closed: RoundClosed = { report, item: this.item, source: this.source };
    this.index += 1;
    this.source = null;
    if (this.index < this.level.rounds) this.draft = beginRound(this.level, this.index, this.now());
    else this.done = true;
    this.onClosed(closed);
  }
}
