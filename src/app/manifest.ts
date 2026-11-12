import type { MetadataRoute } from "next";
import { APP_NAME, APP_TAGLINE } from "@/lib/brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${APP_NAME} — ${APP_TAGLINE}`,
    short_name: "Grantha Seva",
    description: "Book distribution, daily sales and collected money for Gaurangadham Dhams.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0d1b40",
    theme_color: "#0d1b40",
    lang: "en-IN",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Submit Today's Sales", short_name: "Sales", url: "/my/sales", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Submit Money", short_name: "Money", url: "/my/money", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
