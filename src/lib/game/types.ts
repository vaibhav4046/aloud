/**
 * The game contract. The level generator (src/lib/game/run.ts), the scoring
 * rules (scoring.ts), the progress store and the screens all read these types
 * and nothing else. Change a field here and every side of the game moves.
 */

/** How a level is played. All four are voice first, with a typed fallback. */
export type LevelKind =
  /** Explain a concept in your own words; the examiner asks follow-ups. */
  | "say"
  /** The examiner states a plausible claim from the material. It may be a bluff. Catch it or confirm it. */
  | "catch"
  /** A short run of rapid questions across a whole world, with interruptions. */
  | "boss"
  /** Revisit concepts the player got wrong earlier (spaced review). */
  | "recall";

export type Difficulty = 1 | 2 | 3 | 4 | 5;

/**
 * What one round of a level asks. Generated in code from the subject's own
 * pages, so the examiner never has to invent a question or a claim.
 */
export type SayItem = {
  type: "say";
  conceptId: string;
  /** The question the examiner asks (a course exam question, or a generated one). */
  question: string;
  /** A nudge shown when the player asks for a hint. Costs XP, never a heart. */
  hint: string;
  /** recall = say the fact, why = say the reason, apply = use it, exam = the course's own question. */
  focus: "recall" | "why" | "apply" | "exam";
};

export type ClaimAlteration = {
  kind: "number" | "antonym" | "negation" | "swap" | "trap";
  /** The words the page has. */
  from: string;
  /** The words the bluff puts in their place. */
  to: string;
};

export type CatchItem = {
  type: "catch";
  conceptId: string;
  /** The exact words the examiner states. */
  claim: string;
  /** True when the claim was altered or is a known trap. Decided at generation, in code. */
  isBluff: boolean;
  /** The page's own sentence the claim was built from (verbatim). For a trap, the page's correcting sentence. */
  source: string;
  passageId: string;
  page: number | null;
  /** Set on a bluff only. */
  alteration: ClaimAlteration | null;
  trapId?: string;
};

export type LevelItem = SayItem | CatchItem;

export type Level = {
  id: string;
  /** 1-based position in the run, 1..30. */
  index: number;
  /** 1-based world (chapter) this level belongs to. */
  world: number;
  kind: LevelKind;
  title: string;
  /** One line shown on the map node. */
  blurb: string;
  conceptIds: string[];
  difficulty: Difficulty;
  /** Hearts available in this level (3 by default, boss 4). */
  hearts: number;
  /** Number of questions or claims in this level. Equals items.length when items is set. */
  rounds: number;
  /** What each round asks, in order. Always set by generateRun. */
  items?: LevelItem[];
};

export type World = {
  index: number;
  name: string;
  levelIds: string[];
};

/** A generated learning run for one subject (uploaded material or the sample). */
export type Run = {
  id: string;
  subjectId: string;
  subjectTitle: string;
  levels: Level[];
  worlds: World[];
  createdAt: string;
  /** Total levels, 12..30. */
  size: number;
};

/** One quote checked against the player's own pages by code. Collectible. */
export type ProofCard = {
  id: string;
  conceptId: string;
  /** Verbatim quote that code verified against the passage. */
  quote: string;
  page: number | null;
  passageId: string;
  levelId: string;
  earnedAt: string;
};

export type RoundOutcome = "correct" | "partial" | "incorrect" | "bluff_caught" | "bluff_missed" | "skipped";

export type LevelResult = {
  levelId: string;
  stars: 0 | 1 | 2 | 3;
  xp: number;
  heartsLeft: number;
  bestCombo: number;
  rounds: RoundOutcome[];
  proofIds: string[];
  outcome: "won" | "lost" | "quit";
  playedAt: string;
  /** Active play time in ms, for the daily goal ring. */
  ms?: number;
  /** Concepts this play missed (incorrect or bluff_missed) and concepts it answered right, in play order. */
  missedConceptIds?: string[];
  clearedConceptIds?: string[];
};

/** Everything the player carries between sessions. */
export type Progress = {
  runId: string;
  xp: number;
  /** Player rank derived from xp, 1..30. */
  rank: number;
  /** Highest level index unlocked (levels unlock in order). */
  unlockedIndex: number;
  streakDays: number;
  /** ISO date (YYYY-MM-DD, local to the player) of the last day a level was finished. */
  lastPlayedDay: string | null;
  /** One streak freeze earned per 7-day streak, spent automatically. */
  freezes: number;
  results: Record<string, LevelResult>;
  proofs: ProofCard[];
  /** Concept ids the player missed and not yet redeemed; feeds recall levels. */
  weakConceptIds: string[];
  /** Daily goal in minutes and progress today. */
  dailyGoalMinutes: number;
  todayMinutes: number;
  /** Local day (YYYY-MM-DD) that todayMinutes belongs to. */
  todayDay?: string | null;
  updatedAt: string;
};

/** What a level session reports when it ends. Scoring turns it into a LevelResult. */
export type RoundReport = {
  conceptId: string;
  outcome: RoundOutcome;
  /** True when the player cited or was checked against a page. */
  grounded: boolean;
  proof?: Omit<ProofCard, "id" | "levelId" | "earnedAt">;
  /** Milliseconds the player spent on this round. */
  ms: number;
  /** The player asked for a hint. Halves the round's XP, costs no heart. */
  hinted?: boolean;
};
