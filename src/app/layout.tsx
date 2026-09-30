import type { Metadata, Viewport } from "next";
import { Fraunces, IBM_Plex_Mono, Onest } from "next/font/google";
import "./globals.css";
import { SiteFooter } from "@/components/SiteFooter";

/*
 * Typography. Three families, all self-hosted by next/font at build time: the
 * generated @font-face points at /_next/static/media, so there is no runtime
 * request to Google and `font-src 'self'` in the CSP stays untouched. next/font
 * also emits a size-adjusted local fallback for each family, which keeps the
 * layout still when the real font arrives.
 *
 * Fraunces (variable, with its soft and optical-size axes) sets the display
 * type: big, light, slightly wobbly, warm. Onest carries the interface. IBM
 * Plex Mono carries page numbers, timings and passage ids. The weights are
 * variable, so the interface can ask for 340 or 550 without a second file.
 */
const fraunces = Fraunces({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-fraunces",
  axes: ["SOFT", "opsz"],
  style: ["normal", "italic"],
});

const onest = Onest({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-onest",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-plex-mono",
  weight: ["400", "500"],
});

const DESCRIPTION =
  "Drop your notes. Play it out loud. Aloud turns your own material into a run of spoken levels, catches your bluffs, and shows the page that proves each answer.";
const TITLE = "Aloud: learn it by saying it";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "https://aloud.vercel.app"),
  title: { default: TITLE, template: "%s | Aloud" },
  description: DESCRIPTION,
  applicationName: "Aloud",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
  openGraph: { title: TITLE, description: DESCRIPTION, siteName: "Aloud", type: "website" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

export const viewport: Viewport = {
  themeColor: "#FBF8F2",
  colorScheme: "light",
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${onest.variable} ${plexMono.variable}`}>
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:text-[var(--on-primary)]"
        >
          Skip to content
        </a>
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
