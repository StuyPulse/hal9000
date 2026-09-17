import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "HAL9000",
    short_name: "HAL9000",
    description: "StuyPulse competition scouting.",
    start_url: "/scout/match",
    display: "standalone",
    background_color: "#0b0d10",
    theme_color: "#0b0d10",
    icons: [{ src: "/694-logo.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
