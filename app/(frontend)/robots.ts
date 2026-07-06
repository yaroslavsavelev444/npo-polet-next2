import type { MetadataRoute } from "next";
import { baseURL } from "@/resources/content";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/admin/*", "/api/", "/*?*group="],
      },
    ],
    sitemap: `${baseURL}/sitemap.xml`,
  };
}
