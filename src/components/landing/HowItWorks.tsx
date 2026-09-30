import { FileText } from "lucide-react";
import { Reveal } from "@/components/ui/motion";

const FILES = ["Lecture slides.pdf", "Pasted notes", "The sample course"];

const KINDS = [
  { name: "Say it", line: "Explain a concept. The examiner follows up." },
  { name: "Catch it", line: "Spot the claim that is a bluff." },
  { name: "Boss", line: "A fast oral round across the whole world." },
  { name: "Recall", line: "The ones you missed, brought back." },
];

/** Five levels and a boss, as a little path. Decorative: the words beside it carry the meaning. */
function WorldPath() {
  return (
    <div className="al-world" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((n) => (
        <span key={n} style={{ display: "contents" }}>
          <span className={`al-node${n === 0 ? " al-node--done" : ""}`} />
          <span className="al-link" />
        </span>
      ))}
      <span className="al-node al-node--boss" />
    </div>
  );
}

/**
 * How it works, as three scenes. The heading sticks on the left while the
 * scenes scroll past on the right (position: sticky, no scripting), and each
 * scene lifts in as it arrives.
 */
export function HowItWorks() {
  return (
    <section id="how" className="al-section al-wrap" aria-labelledby="how-h">
      <div className="al-how">
        <div className="al-how-head">
          <Reveal>
            <span className="pill al-kicker">How it works</span>
            <h2 id="how-h" className="display al-h2">
              Notes in. A game out.
            </h2>
            <p className="lede al-lede">
              Aloud reads what you give it and builds a run of 12 to 30 levels, grouped into worlds of about five. The
              last level of every world is a boss.
            </p>
          </Reveal>
        </div>

        <div className="al-scenes">
          <Reveal className="surface al-scene">
            <div>
              <span className="al-step-n" aria-hidden="true">1</span>
              <h3 className="heading">Drop your notes.</h3>
              <p>PDF, text or a paste. No notes to hand? The sample course is a real set of notes on transformers.</p>
            </div>
            <div className="al-viz">
              {FILES.map((f) => (
                <span key={f} className="al-file">
                  <FileText size={16} aria-hidden="true" />
                  {f}
                </span>
              ))}
            </div>
          </Reveal>

          <Reveal className="surface al-scene" delay={80}>
            <div>
              <span className="al-step-n" aria-hidden="true">2</span>
              <h3 className="heading">Play it out loud.</h3>
              <p>Talk to the examiner, or type if you would rather. Every level is one of four kinds.</p>
            </div>
            <div className="al-kinds">
              {KINDS.map((k) => (
                <div key={k.name} className="al-kind">
                  <b>{k.name}</b>
                  <span>{k.line}</span>
                </div>
              ))}
            </div>
            <WorldPath />
          </Reveal>

          <Reveal className="surface surface--accent al-scene" delay={80}>
            <div>
              <span className="al-step-n" aria-hidden="true">3</span>
              <h3 className="heading">Keep the proof.</h3>
              <p className="muted">
                When your answer holds up, Aloud finds the words on your page and checks them by code. That quote, with
                its page number, becomes a proof card in your collection.
              </p>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
