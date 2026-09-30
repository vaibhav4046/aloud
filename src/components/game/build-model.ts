/**
 * Pure model for the "building your run" screen. The steps are driven by the
 * real messages the intake route streams (one sentence per step, then the
 * built subject with its counts) and then by the run the game engine returns.
 * Nothing here is timed or faked: a step is active only after the line that
 * starts it arrived, and a count is shown only once a message carried it.
 */

export type StepId = "read" | "concepts" | "levels";
export type StepStatus = "pending" | "active" | "done";

export type BuildStep = { id: StepId; label: string; status: StepStatus; detail: string | null };

export type BuildState = {
  steps: BuildStep[];
  lines: string[];
  concepts: number | null;
  passages: number | null;
  levels: number | null;
  error: string | null;
  finished: boolean;
};

export type StreamMessage = {
  line?: string;
  subject?: { id: string; title: string; concepts: number; questions: number; passages: number };
  error?: { code?: string; message?: string };
};

export function initialBuild(): BuildState {
  return {
    steps: [
      { id: "read", label: "Reading your material", status: "pending", detail: null },
      { id: "concepts", label: "Finding the concepts", status: "pending", detail: null },
      { id: "levels", label: "Building your levels", status: "pending", detail: null },
    ],
    lines: [],
    concepts: null,
    passages: null,
    levels: null,
    error: null,
    finished: false,
  };
}

function setStep(steps: BuildStep[], id: StepId, status: StepStatus, detail?: string | null): BuildStep[] {
  return steps.map((s) => {
    if (s.id !== id) return s;
    // A finished step never goes backwards.
    if (s.status === "done" && status !== "done") return s;
    return { ...s, status, detail: detail === undefined ? s.detail : detail };
  });
}

const READING = /^(Reading|Writing a starting|Opening)/i;
const FINDING = /(Finding the ideas|Working through|Writing your questions)/i;

export function applyMessage(state: BuildState, msg: StreamMessage): BuildState {
  if (msg.error) {
    return { ...state, error: msg.error.message ?? "That did not go through. Try again.", finished: true };
  }
  let next = state;
  if (msg.line) {
    let steps = next.steps;
    if (READING.test(msg.line)) steps = setStep(steps, "read", "active");
    else if (FINDING.test(msg.line)) {
      steps = setStep(setStep(steps, "read", "done"), "concepts", "active");
    }
    next = { ...next, steps, lines: [...next.lines, msg.line].slice(-40) };
  }
  if (msg.subject) {
    const { concepts, passages } = msg.subject;
    let steps = setStep(next.steps, "read", "done", `${passages} passage${passages === 1 ? "" : "s"}`);
    steps = setStep(steps, "concepts", "done", `${concepts} concept${concepts === 1 ? "" : "s"} found`);
    steps = setStep(steps, "levels", "active");
    next = { ...next, steps, concepts, passages };
  }
  return next;
}

/** The run came back from the engine: the last step finishes with its real level count. */
export function applyRun(state: BuildState, levels: number, concepts: number, worlds: number): BuildState {
  let steps = setStep(state.steps, "read", "done");
  steps = setStep(steps, "concepts", "done", `${concepts} concept${concepts === 1 ? "" : "s"} found`);
  steps = setStep(steps, "levels", "done", `${levels} levels in ${worlds} world${worlds === 1 ? "" : "s"}`);
  return { ...state, steps, levels, concepts: state.concepts ?? concepts, finished: true };
}

/** Split a growing NDJSON buffer into complete messages and the unfinished tail. */
export function parseNdjson(buffer: string): { messages: StreamMessage[]; rest: string } {
  const parts = buffer.split("\n");
  const rest = parts.pop() ?? "";
  const messages: StreamMessage[] = [];
  for (const part of parts) {
    if (!part.trim()) continue;
    try {
      messages.push(JSON.parse(part) as StreamMessage);
    } catch {
      /* one bad line costs one sentence, not the build */
    }
  }
  return { messages, rest };
}

/** What each refusal means, in a sentence the player can act on. */
export const BUILD_ERRORS: Record<string, string> = {
  NO_TEXT_IN_FILE: "There is no readable text in that file. Paste the text instead and Aloud will read that.",
  BAD_FILE: "Aloud reads PDFs, Word documents and plain text. That file is something else. Paste the text instead.",
  FILE_TOO_LARGE: "That file is too large for one upload. Try a smaller one, or paste the part you are studying.",
  NO_READABLE_TEXT: "There was too little to read there. Paste the text and Aloud will read that.",
  RATE_LIMITED: "That is a lot of builds at once. Wait a moment and try again.",
};

export function buildErrorCopy(code: string | undefined, message: string | undefined): string {
  return (code && BUILD_ERRORS[code]) || message || "That did not go through. Try again.";
}

export const MIN_PASTE_CHARS = 200;
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
export const MAX_DOCS = 4;

/** Client-side checks that mirror the route, so the player is told before the upload. */
export function validateIntake(kind: "paste" | "files", input: { text?: string; files?: { size: number }[] }): string | null {
  if (kind === "paste") {
    return (input.text ?? "").trim().length < MIN_PASTE_CHARS ? "Paste a bit more. A few paragraphs is enough." : null;
  }
  const files = input.files ?? [];
  if (!files.length) return "Choose a file first.";
  if (files.length > MAX_DOCS) return `Aloud reads up to ${MAX_DOCS} files at once. Keep the ones that matter most.`;
  if (files.reduce((n, f) => n + f.size, 0) > MAX_UPLOAD_BYTES) return "Those come to more than 4 MB together. Try fewer, or paste the part you are studying.";
  return null;
}
