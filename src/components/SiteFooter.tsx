import Link from "next/link";
import { Wordmark } from "@/components/ui/Wordmark";

/*
 * Footer on every page. The four trust pages are written from the code by
 * scripts/data-inventory.mjs; the source link is the repository the judges
 * are reading. Plain links, no icons.
 */
const LINKS = [
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/accessibility", label: "Accessibility" },
  { href: "/about", label: "About" },
] as const;

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-card">
        <div className="site-footer-brand">
          <Wordmark size={28} href="/" />
          <p>Learn it by saying it.</p>
        </div>
        <nav aria-label="Legal and project" className="site-footer-links">
          {LINKS.map(({ href, label }) => (
            <Link key={href} href={href} className="nav-link">
              {label}
            </Link>
          ))}
          <a href="https://github.com/vaibhav4046/aloud" target="_blank" rel="noopener noreferrer" className="nav-link">
            Source
          </a>
        </nav>
        <p className="site-footer-note">Hackathon build. Voice by AssemblyAI.</p>
      </div>
    </footer>
  );
}
