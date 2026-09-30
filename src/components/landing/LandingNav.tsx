import Link from "next/link";
import { Wordmark } from "@/components/ui/Wordmark";
import { SAMPLE_RUN_HREF } from "@/lib/landing/links";

/** The floating pill at the top of the landing page. Three anchors and one action. */
export function LandingNav() {
  return (
    <div className="al-nav-wrap">
      <nav className="al-nav" aria-label="Primary">
        <Wordmark href="/" size={26} />
        <div className="al-nav-links">
          <a href="#how" className="nav-link">How it works</a>
          <a href="#bluff" className="nav-link">The bluff</a>
          <a href="#features" className="nav-link">What keeps you going</a>
          <a href="#limits" className="nav-link">Limits</a>
        </div>
        <Link href={SAMPLE_RUN_HREF} className="btn-primary">
          Start the sample run
        </Link>
      </nav>
    </div>
  );
}
