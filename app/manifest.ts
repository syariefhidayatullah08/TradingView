import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "KriptoScope — Analisa Crypto & Berita Dunia",
    short_name: "KriptoScope",
    description: "Analisa teknikal dan fundamental crypto dengan berita politik dan ekonomi dunia terbaru.",
    start_url: "/",
    display: "standalone",
    background_color: "#fff1f7",
    theme_color: "#fbcfe8",
    lang: "id",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
