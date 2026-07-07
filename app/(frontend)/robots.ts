// app/(frontend)/robots.ts
import type { MetadataRoute } from "next";
import { baseURL } from "@/resources/content";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin",
          "/admin/*",
          "/api/",
          "/auth/",
          "/cart",
          "/checkout",
          "/profile",
          "/orders",
          "/orders/*",
          "/wishlist",
          "/reviews",
          "/*?*group=",
        ],
      },
    ],
    sitemap: `${baseURL}/sitemap.xml`,
    host: baseURL,
  };
}
