import type { MetadataRoute } from "next";

/**
 * I52 — Manifest della PWA (servito come /manifest.webmanifest da Next).
 * Installabile su desktop/mobile; display standalone per l'uso come app.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MiniMax Token Monitor",
    short_name: "MiniMax Mon",
    description:
      "Monitora quota, finestre di reset e statistiche del tuo Token Plan MiniMax con fuso orario Europe/Rome.",
    lang: "it",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#09090b",
    theme_color: "#09090b",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
