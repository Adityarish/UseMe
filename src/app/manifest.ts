import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "UseMe — simple secure sharing",
    short_name: "UseMe",
    description: "Share files and text through one simple, secure link.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f8f4",
    theme_color: "#3563e9",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
