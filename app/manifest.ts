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
      { src: "/icon", sizes: "32x32", type: "image/png" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
