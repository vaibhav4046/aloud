import type { CatchItem, Level, LevelItem } from "@/lib/game/types";
import type { FailureView } from "@/components/oral/model";
import type { PlayState, Feedback } from "./play-model";
import type { OrbMode } from "./VoiceOrb";
import type { ProofView } from "./PlayParts";

export type { Stance } from "./round-session";
import type { Stance } from "./round-session";

/** What a catch round shows once it resolves: the claim, the page's own sentence and what was altered. */
export type CatchReveal = {
  item: CatchItem;
  outcome: Feedback["outcome"];
};

export type Connection = "idle" | "connecting" | "live" | "ended";

/**
 * Everything the play screen draws and every action it can take. The hook
 * (useLevelSession) builds this from the engine and the voice stack; the screen
 * is presentational over it, which is what lets both be tested apart.
 */
export type LevelView = {
  level: Level;
  subjectId: string;
  play: PlayState;
  item: LevelItem | null;
  mode: "voice" | "typed";
  connection: Connection;
  orbMode: OrbMode;
  stateLine: string;
  stateHint: string;
  examinerText: string;
  examinerCut: boolean;
  youText: string;
  readLevels?: () => { learner: number; examiner: number };
  /** A blocking failure to show in place of the round (mic blocked, session lost). */
  failure: FailureView | null;
  /** A notice that does not stop play (still there, tab hidden). */
  notice: string | null;
  /** True while an answer is being checked against the pages. */
  pending: boolean;
  stance: Stance | null;
  reveal: CatchReveal | null;
  proofView: ProofView | null;
  peekPassageId: string | null;
  announce: string;
  actions: {
    startVoice: () => void;
    startTyped: () => void;
    switchToTyped: () => void;
    submitTyped: (text: string) => void;
    choose: (s: Stance, correction?: string) => void;
    hint: () => void;
    peek: () => void;
    dismissProof: () => void;
    dismissReveal: () => void;
    end: () => void;
  };
};
