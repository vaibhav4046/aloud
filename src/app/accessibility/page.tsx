import type { Metadata } from "next";
import { PublicShell } from "@/components/PublicShell";

/* Rendered per request so the CSP nonce reaches Next's bootstrap scripts (see src/proxy.ts). */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Accessibility",
  description: "What was tested for accessibility in Aloud, and the known gaps.",
};

export default function AccessibilityPage() {
  return (
    <PublicShell>
      <h1 className="display">Accessibility</h1>
      <p className="mt-4" style={{ color: "var(--text-secondary)" }}>
        The target is WCAG 2.2 level AA where practical. This is a statement of what has been checked, not a claim of
        conformance.
      </p>

      <div className="mt-6 space-y-8">
        <section aria-labelledby="a-done">
          <h2 id="a-done" className="heading text-xl">What is in place</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>Every spoken examiner line is also shown as text. Answering by typing is always available, which also covers a missing or blocked microphone.</li>
            <li>A skip link, one h1 per page, and landmark regions on every page.</li>
            <li>Focus is always visible: a 2 px ring, offset 2 px, in a colour that clears 3:1 against the page.</li>
            <li>Text colours clear 4.5:1 on their surfaces. The pairs are listed in <code>design/contrast-pairs.json</code> and checked by <code>node scripts/check-contrast.mjs</code>.</li>
            <li>Animation and transitions are switched off when your system asks for reduced motion.</li>
            <li>The state line is a polite live region. Partial transcript words are not announced.</li>
            <li>Audio never plays before you press a button.</li>
            <li>The landing page, the privacy page, the subjects page and the oral exam screen were screenshotted at 390 and 1440 px on 2026-09-30, and the landing page also at 768 px, with no horizontal scroll. The findings are in docs/evidence/visual/REVIEW-site.md. Other screens were not.</li>
            <li>The moving colour wash behind the pages holds still under reduced motion, and text stays above 4.5:1 on every pool of it.</li>
            <li>The waveform on the landing page asks for the microphone only when you press its button, and it only measures your voice on your device.</li>
          </ul>
        </section>

        <section aria-labelledby="a-tested">
          <h2 id="a-tested" className="heading text-xl">How it was tested</h2>
          <p>
            Automated: axe-core through Playwright on the main routes (<code>npm run test:accessibility</code>) and a
            naming check on controls. A recorded manual keyboard pass and a session with a screen-reader user have not
            been done yet.
          </p>
        </section>

        <section aria-labelledby="a-gaps">
          <h2 id="a-gaps" className="heading text-xl">Known gaps</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>The oral exam depends on a microphone and headphones for the spoken path. The typed path exists but is slower and has been tested less.</li>
            <li>Some study screens (map, quiz, today) have only been restyled, not redesigned, and have not had a manual keyboard pass. The game screens have not had a screen-reader pass.</li>
            <li>The concept map is a graph drawing and has not been checked for screen-reader navigation.</li>
            <li>Only English interface text is provided.</li>
          </ul>
        </section>

        <p>
          To report a barrier, use the contact in SECURITY.md in the repository.
        </p>
      </div>
    </PublicShell>
  );
}
