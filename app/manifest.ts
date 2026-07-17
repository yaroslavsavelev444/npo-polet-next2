import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "НПО Полет - купить сеткомет Паук 30Б , Вултур Р10, трехствольную установку",
    short_name: "НПО Полет",
    description:
      "Купить сеткомет Паук 30Б , Вултур Р10, трехствольную установку",
    start_url: "/",
    display: "standalone",
    background_color: "#1A1D24",
    theme_color: "#FF4500",
    lang: "ru",
    icons: [
      { src: "/icon1", sizes: "16x16", type: "image/png" },
      { src: "/icon2", sizes: "32x32", type: "image/png" },
      {
        src: "/android-chrome-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/android-chrome-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/maskable-icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
