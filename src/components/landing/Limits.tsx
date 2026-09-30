import Link from "next/link";
import { Check, X } from "lucide-react";
import { Reveal } from "@/components/ui/motion";

const NOT_FOR = [
  ["You want a grade a school will accept.", "Aloud scores practice. It issues nothing an exam board or a tutor can count."],
  ["Your notes are thin or wrong.", "It checks answers against your pages. Thin notes make a thin run, and a page that is wrong is treated as right."],
  ["You cannot speak out loud right now.", "Typed answers work on every level, but the point of the game is saying it."],
  ["You want a score that proves anything to anyone.", "Each round is marked in your browser and the server only checks that the result is possible for that level. It cannot replay how you played, so stars and XP are yours to keep honest."],
  ["You want a game you cannot peek at.", "The marks on each bluff travel with the level, and the examiner's level prompt names them. Anyone who opens the network tab can read them. That only spoils your own game."],
  ["You want to be entertained without reading.", "Every question comes from material you have to know. The game adds pressure, not answers."],
];

const LEAVES = [
  ["Your voice.", "While a level is running, microphone audio streams from your browser to AssemblyAI, on a token made for that one session. Aloud writes no audio to disk or a database."],
  ["Your notes and answers.", "Passages from your notes and your answer go to a language-model provider so it can mark you against your pages. They are saved under a random ID in a cookie. There is no account."],
  ["Nothing else.", "No ads, no analytics script, no tracking. The waveform above only measures your voice on this device."],
];

/** The honest section: who this is not for, and exactly what leaves the device. */
export function Limits() {
  return (
    <section id="limits" className="al-section al-wrap" aria-labelledby="limits-h">
      <Reveal>
        <span className="pill al-kicker">Limits</span>
        <h2 id="limits-h" className="display al-h2 al-h2--wide">
          Where Aloud stops.
        </h2>
      </Reveal>

      <div className="al-limits">
        <Reveal>
          <div className="surface" style={{ height: "100%" }}>
            <h3 className="heading">Who this is not for</h3>
            <ul className="al-list">
              {NOT_FOR.map(([head, body]) => (
                <li key={head}>
                  <X size={20} aria-hidden="true" color="var(--correction)" />
                  <span>
                    <b>{head}</b> {body}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Reveal>

        <Reveal delay={90}>
          <div className="surface surface--panel" style={{ height: "100%" }}>
            <h3 className="heading" style={{ color: "var(--on-panel)" }}>
              What leaves your device
            </h3>
            <ul className="al-list">
              {LEAVES.map(([head, body]) => (
                <li key={head}>
                  <Check size={20} aria-hidden="true" color="var(--accent-strong)" />
                  <span>
                    <b>{head}</b> {body}
                  </span>
                </li>
              ))}
            </ul>
            <p style={{ margin: "24px 0 0", fontSize: "var(--fs-body-sm)", color: "var(--on-panel-muted)" }}>
              The full inventory is on the <Link href="/privacy">privacy page</Link>.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
