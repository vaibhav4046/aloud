import type { MetadataRoute } from "next";

/** Web app manifest. Colours are copies of --canvas and --primary in src/styles/tokens.css. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Aloud",
    short_name: "Aloud",
    description: "Learn it by saying it. Drop your notes and play them out loud.",
    start_url: "/",
    display: "standalone",
    background_color: "#FBF8F2",
    theme_color: "#FBF8F2",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
