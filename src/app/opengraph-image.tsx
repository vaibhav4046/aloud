import { ImageResponse } from "next/og";
import { idleBarAmp } from "@/components/ui/motion/idle";

/**
 * The link preview: 1200x630, generated at build time. The same wave the
 * landing hero draws (idleBarAmp), the same words, the same colours.
 * ImageResponse cannot read CSS variables or load the site fonts, so the hex
 * values are copies of --canvas, --primary, --accent, --text-secondary and the
 * four --wash-* tokens in src/styles/tokens.css, and the type is the renderer's
 * default sans.
 */
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Aloud: learn it by saying it";

const BARS = 41;
const WAVE_HEIGHT = 190;

export default function OpengraphImage() {
  const bars = Array.from({ length: BARS }, (_, i) => Math.max(10, Math.round(idleBarAmp(i, BARS, 2.4) * WAVE_HEIGHT)));
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background:
            "radial-gradient(circle at 12% 18%, #E4D6FA 0, rgba(228,214,250,0) 42%), radial-gradient(circle at 90% 12%, #FFD9C4 0, rgba(255,217,196,0) 40%), radial-gradient(circle at 84% 92%, #CDEBDD 0, rgba(205,235,221,0) 44%), #FBF8F2",
          padding: "64px 80px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 52, height: 52, borderRadius: 16, background: "#1B2321", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
            {[10, 18, 26, 16, 8].map((h, i) => (
              <div key={i} style={{ width: 4, height: h, borderRadius: 2, background: "#E7D9FB" }} />
            ))}
          </div>
          <div style={{ color: "#1B1A17", fontSize: 40, fontWeight: 600, letterSpacing: -1 }}>aloud</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ color: "#1B1A17", fontSize: 92, fontWeight: 600, letterSpacing: -3, lineHeight: 1 }}>Learn it by saying it.</div>
          <div style={{ color: "#46433B", fontSize: 34, marginTop: 20 }}>Drop your notes. Play it out loud.</div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, height: WAVE_HEIGHT / 2 }}>
          {bars.map((h, i) => (
            <div key={i} style={{ width: 12, height: h / 2, borderRadius: 6, background: "#1B2321" }} />
          ))}
        </div>
      </div>
    ),
    size
  );
}
