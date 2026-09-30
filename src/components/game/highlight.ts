export type Part = { text: string; hit: boolean };

/**
 * Split a quote into plain and highlighted parts, marking every span the code
 * matched against the player's words. Spans are searched case-insensitively,
 * overlapping spans merge, and a span that is not in the quote is ignored. With
 * no usable span the whole quote is one highlighted part: it is a verbatim
 * quote the code found on the page, so the whole of it is the match.
 */
export function highlightParts(quote: string, spans: string[]): Part[] {
  const lower = quote.toLowerCase();
  const ranges: [number, number][] = [];
  for (const span of spans) {
    const s = span.trim().toLowerCase();
    if (s.length < 2) continue;
    let from = 0;
    for (;;) {
      const at = lower.indexOf(s, from);
      if (at < 0) break;
      ranges.push([at, at + s.length]);
      from = at + s.length;
    }
  }
  if (!ranges.length) return quote ? [{ text: quote, hit: true }] : [];
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  const out: Part[] = [];
  let pos = 0;
  for (const [a, b] of merged) {
    if (a > pos) out.push({ text: quote.slice(pos, a), hit: false });
    out.push({ text: quote.slice(a, b), hit: true });
    pos = b;
  }
  if (pos < quote.length) out.push({ text: quote.slice(pos), hit: false });
  return out;
}
