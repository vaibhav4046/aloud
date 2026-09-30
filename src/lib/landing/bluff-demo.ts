import { getCourse } from "@/lib/courses";
import { SAMPLE_COURSE_ID } from "@/lib/sample-course";

/**
 * The claims in the landing page's Spot-the-Bluff mini-demo.
 *
 * Nothing here is written for the page. Each claim is a sentence the sample
 * course already carries: either a course trap (a plausible false statement,
 * `verdict: "bluff"`) or a sentence lifted from a passage (`verdict: "true"`).
 * Each one is paired with the passage that settles it and the exact words to
 * highlight. `buildBluffDemo` refuses to return anything whose quote is not a
 * verbatim substring of the passage, and tests/landing-demo.test.ts runs it, so
 * the demo cannot quote a page that does not say that.
 */

export type BluffRound = {
  id: string;
  claim: string;
  verdict: "true" | "bluff";
  /** One sentence that says why, in the examiner's voice. */
  because: string;
  proof: { page: number; section: string; before: string; quote: string; after: string };
};

type Spec = { id: string; trapId?: string; claim?: string; verdict: "true" | "bluff"; chunkId: string; quote: string; because: string };

const SPECS: Spec[] = [
  {
    id: "backprop",
    trapId: "trap_backprop_gd",
    verdict: "bluff",
    chunkId: "ch_bp_2",
    quote: "Backpropagation computes gradients; gradient descent uses them.",
    because: "They are two different steps. One finds the direction, the other decides how far to move.",
  },
  {
    id: "which-direction",
    claim: "Backprop answers which direction to move, and the optimiser answers how far.",
    verdict: "true",
    chunkId: "ch_bp_2",
    quote: "backprop answers 'which direction', the optimiser answers 'how far'",
    because: "That is the split the page draws.",
  },
  {
    id: "importance",
    trapId: "trap_importance_order",
    verdict: "bluff",
    chunkId: "ch_pos_2",
    quote: "it can still compare tokens and find which ones are related, but it cannot distinguish their order",
    because: "What the model loses without position is order, not importance.",
  },
];

export function buildBluffDemo(): BluffRound[] {
  const course = getCourse(SAMPLE_COURSE_ID);
  const chunks = new Map(course.sources.flatMap((s) => s.chunks).map((c) => [c.id, c]));

  return SPECS.map((spec) => {
    const chunk = chunks.get(spec.chunkId);
    if (!chunk) throw new Error(`landing demo: passage ${spec.chunkId} is not in the sample course`);
    const at = chunk.text.indexOf(spec.quote);
    if (at < 0) throw new Error(`landing demo: quote for ${spec.id} is not verbatim in ${spec.chunkId}`);

    let claim = spec.claim;
    if (spec.trapId) {
      const trap = course.traps.find((t) => t.id === spec.trapId);
      if (!trap) throw new Error(`landing demo: trap ${spec.trapId} is not in the sample course`);
      claim = trap.statement;
    }
    if (!claim) throw new Error(`landing demo: ${spec.id} has no claim`);

    // Show a little context around the quote, cut at word edges, so the reader sees it sits in a page.
    const from = Math.max(0, at - 70);
    const to = Math.min(chunk.text.length, at + spec.quote.length + 70);
    const trimStart = from === 0 ? 0 : chunk.text.indexOf(" ", from) + 1 || from;
    const cutEnd = to === chunk.text.length ? to : chunk.text.lastIndexOf(" ", to);
    const trimEnd = cutEnd > at + spec.quote.length ? cutEnd : to;
    return {
      id: spec.id,
      claim,
      verdict: spec.verdict,
      because: spec.because,
      proof: {
        page: chunk.locator.page ?? 0,
        section: chunk.locator.section ?? "",
        before: (trimStart > 0 ? "…" : "") + chunk.text.slice(trimStart, at),
        quote: spec.quote,
        after: chunk.text.slice(at + spec.quote.length, trimEnd) + (trimEnd < chunk.text.length ? "…" : ""),
      },
    };
  });
}
