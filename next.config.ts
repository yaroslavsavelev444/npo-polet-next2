import path from "node:path";
import type { NextConfig } from "next";
import "./src/env.ts";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,

  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      // Dev: реальный URL медиа включает явный порт (:3000),
      // поэтому port должен быть "3000", а не "" ("" означает
      // "URL БЕЗ порта" и никогда не совпадёт с localhost:3000).
      {
        protocol: "http",
        hostname: "localhost",
        port: "3000",
        pathname: "/api/media/**",
      },
      {
        protocol: "http",
        hostname: "127.0.0.1",
        port: "3000",
        pathname: "/api/media/**",
      },
      // Прод: без этих паттернов картинки в проде всегда будут падать
      // с "hostname not configured", независимо от того, что исправлено
      // в serverURL.
      {
        protocol: "https",
        hostname: "test.npo-polet.ru",
        pathname: "/api/media/**",
      },
      {
        protocol: "https",
        hostname: "www.test.npo-polet.ru",
        pathname: "/api/media/**",
      },
    ],
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value:
              "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
        ],
      },
    ];
  },

  turbopack: {
    root: path.resolve(__dirname),
    rules: { "*.md": { loaders: [], as: "*.empty" } },
  },

  serverExternalPackages: [
    "esbuild",
    "esbuild-register",
    "drizzle-kit",
    "@payloadcms/db-postgres",
    "@payloadcms/drizzle",
  ],
};

export default nextConfig;
