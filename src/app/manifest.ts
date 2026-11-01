import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "FitFlow — مربی هوشمند تمرین و تغذیه",
    short_name: "FitFlow",
    description: "برنامه تمرینی و غذایی شخصی با هوش مصنوعی",
    lang: "fa",
    dir: "rtl",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f8fafc",
    theme_color: "#0b8a51",
    categories: ["health", "fitness", "lifestyle"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "تمرین امروز", url: "/workouts/today" },
      { name: "ثبت غذا", url: "/nutrition/log" },
    ],
  };
}
