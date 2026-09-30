import { Fragment } from "react";
import Link from "next/link";
import { headers } from "next/headers";
import { LandingNav } from "@/components/landing/LandingNav";
import { HeroStage } from "@/components/landing/HeroStage";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { BluffDemo } from "@/components/landing/BluffDemo";
import { Features } from "@/components/landing/Features";
import { Limits } from "@/components/landing/Limits";
import { Magnetic, Parallax, Reveal } from "@/components/ui/motion";
import { buildBluffDemo } from "@/lib/landing/bluff-demo";
import { SAMPLE_RUN_HREF, UPLOAD_HREF } from "@/lib/landing/links";
import "./landing.css";

/*
 * Aloud front door.
 *
 * A server component. The client islands are the hero stage (microphone
 * meter), the Bluff demo and the motion primitives. Rendered per request on
 * purpose: reading the nonce set by src/proxy.ts is what marks this route
 * dynamic, and only a dynamically rendered document gets Next's bootstrap
 * scripts stamped with it. Prerender it and `script-src 'strict-dynamic'`
 * blocks every chunk.
 *
 * Nothing on this page is a number or a name the product cannot back: no
 * pricing, no testimonials, no logos, no user counts. The claims in the demo
 * come from the sample course and are checked by tests/landing-demo.test.ts.
 */

const HERO_WORDS = ["Learn", "it", "by", "saying", "it."];
const ITALIC_FROM = 3;

export default async function Home() {
  // Marks the route dynamic; see the note above. The value itself is unused.
  await headers();
  const rounds = buildBluffDemo();

  return (
    <div className="al-page">
      <LandingNav />

      <main id="main">
        <section className="al-hero al-wrap" aria-labelledby="hero-h">
          <span className="pill">
            <span className="al-live-dot" aria-hidden="true" style={{ background: "var(--success)" }} />
            A study game you play by talking
          </span>
          <h1 id="hero-h" className="hero-type al-hero-title">
            {HERO_WORDS.map((w, i) => (
              <Fragment key={i}>
                {i > 0 && " "}
                <span className={`w${i >= ITALIC_FROM ? " italic-accent" : ""}`} style={{ ["--i" as string]: i }}>
                  {w}
                </span>
              </Fragment>
            ))}
          </h1>
          <p className="al-hero-sub">Drop your notes. Play it out loud.</p>

          <div className="al-cta">
            <Magnetic>
              <Link href={SAMPLE_RUN_HREF} className="btn-primary">
                Start the sample run
              </Link>
            </Magnetic>
            <Magnetic>
              <Link href={UPLOAD_HREF} className="btn-ghost">
                Upload your notes
              </Link>
            </Magnetic>
          </div>
          <p className="al-hero-note">Headphones and a quiet room help. Every level can be typed instead of spoken.</p>

          <div className="al-stage-wrap">
            <Parallax className="al-float al-float-proof" speed={-0.05} max={40}>
              <div className="al-proof-mini" aria-hidden="true">
                <span className="al-page-tag">Page 20 &middot; proof card</span>
                <p>&ldquo;Backpropagation computes gradients; gradient descent uses them.&rdquo;</p>
              </div>
            </Parallax>
            <Parallax className="al-float al-float-xp" speed={0.07} max={44}>
              <div className="al-xp-mini" aria-hidden="true">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="11" fill="var(--primary)" />
                  <path d="m7 12.5 3.2 3.2L17 8.8" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Bluff caught. +175 XP
              </div>
            </Parallax>
            <HeroStage />
          </div>
        </section>

        <HowItWorks />

        <section id="bluff" className="al-bluff al-wrap" aria-labelledby="bluff-h">
          <div className="al-bluff-panel">
            <div className="al-bluff-grid">
              <Reveal>
                <span className="pill al-kicker">Spot the Bluff</span>
                <h2 id="bluff-h" className="display">
                  The examiner will lie to you. Catch it.
                </h2>
                <p className="copy">
                  Half the claims are true. Half are believable and wrong. Say which, correct the bluff, and the page settles it.
                </p>
                <p className="fine">
                  Try three claims from the sample notes. The demo uses the same hearts and XP as a real level.
                </p>
              </Reveal>
              <Reveal delay={100}>
                <BluffDemo rounds={rounds} />
              </Reveal>
            </div>
          </div>
        </section>

        <Features />
        <Limits />

        <section className="al-section al-wrap al-close" aria-labelledby="close-h">
          <Reveal>
            <h2 id="close-h" className="hero-type" style={{ fontSize: "var(--fs-display)", lineHeight: 1.02 }}>
              Say it once. See if it <span className="italic-accent">holds</span>.
            </h2>
            <div className="al-cta">
              <Magnetic>
                <Link href={SAMPLE_RUN_HREF} className="btn-primary">
                  Start the sample run
                </Link>
              </Magnetic>
              <Magnetic>
                <Link href={UPLOAD_HREF} className="btn-ghost">
                  Upload your notes
                </Link>
              </Magnetic>
            </div>
          </Reveal>
        </section>
      </main>
    </div>
  );
}
