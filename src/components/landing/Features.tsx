import { Gift } from "lucide-react";
import { Reveal, CountUp } from "@/components/ui/motion";
import { Hearts, ProgressRing, StreakFlame } from "@/components/ui/game-bits";

/**
 * The parts of the game that keep a person coming back, shown by what each
 * one does. The numbers in the pictures are example values, and the footnote
 * says so. The rules in the words (3 hearts, a freeze every 7 days, a 10
 * minute default) are the rules the scoring code implements.
 */
export function Features() {
  return (
    <section id="features" className="al-section al-wrap" aria-labelledby="feat-h">
      <Reveal>
        <span className="pill al-kicker">What keeps you going</span>
        <h2 id="feat-h" className="display al-h2 al-h2--wide">
          Small rewards you can see.
        </h2>
        <p className="lede al-lede">Every part below has a job. None of it is there to guilt you back in.</p>
      </Reveal>

      <div className="al-bento">
        <Reveal className="al-b-proof">
          <div className="surface surface--accent al-tile">
            <div className="art">
              <div className="al-proof-mini" style={{ width: "100%", maxWidth: 420 }}>
                <span className="al-page-tag">Page 20 &middot; Optimisation background</span>
                <p>
                  &ldquo;Backpropagation computes gradients; gradient descent uses them.&rdquo;
                </p>
              </div>
            </div>
            <div>
              <h3 className="heading">Proof cards</h3>
              <p className="muted">
                Every answer that checks out against your page becomes a card you keep: the quote, the page number, and
                a match checked by code. Your collection is a record of what you have shown you know.
              </p>
            </div>
          </div>
        </Reveal>

        <Reveal className="al-b-streak" delay={70}>
          <div className="surface al-tile">
            <div className="art">
              <StreakFlame days={5} frozen size={44} />
            </div>
            <div>
              <h3 className="heading">Streak</h3>
              <p>Finish one level a day and the flame stays lit. Every 7 days you earn a freeze, and it covers a missed day by itself.</p>
            </div>
          </div>
        </Reveal>

        <Reveal className="al-b-hearts" delay={140}>
          <div className="surface al-tile">
            <div className="art">
              <Hearts left={2} max={3} size={34} />
            </div>
            <div>
              <h3 className="heading">Hearts</h3>
              <p>Three per level, four in a boss. A wrong answer or a missed bluff costs one. Run out and the level is lost, and the retry is free.</p>
            </div>
          </div>
        </Reveal>

        <Reveal className="al-b-recall">
          <div className="surface al-tile">
            <div className="art al-recall" aria-label="A missed concept comes back as a Recall level, then counts as held">
              <span className="dot">Missed</span>
              <span className="arrow" aria-hidden="true">&rarr;</span>
              <span className="dot" data-tone="accent">Recall level</span>
              <span className="arrow" aria-hidden="true">&rarr;</span>
              <span className="dot">Held</span>
            </div>
            <div>
              <h3 className="heading">Spaced recall</h3>
              <p>A concept you missed comes back later in the run as its own Recall level, spaced out so you meet it again before it fades.</p>
            </div>
          </div>
        </Reveal>

        <Reveal className="al-b-ring" delay={70}>
          <div className="surface al-tile">
            <div className="art">
              <ProgressRing value={7} goal={10} size={112} />
            </div>
            <div>
              <h3 className="heading">Daily ring</h3>
              <p>
                It fills as you play. The default goal is <CountUp to={10} /> minutes, and you set your own.
              </p>
            </div>
          </div>
        </Reveal>

        <Reveal className="al-b-crate" delay={140}>
          <div className="surface al-tile">
            <div className="art">
              <span className="al-crate" aria-hidden="true">
                <Gift size={30} />
              </span>
            </div>
            <div>
              <h3 className="heading">Crates</h3>
              <p>Now and then a level ends with a crate: a fact from your own notes, a streak freeze, or an XP boost. You do not know which.</p>
            </div>
          </div>
        </Reveal>
      </div>

      <p className="al-footnote">The pictures use example values. The rules in the text are the ones the game scores with.</p>
    </section>
  );
}
