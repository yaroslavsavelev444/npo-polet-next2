import path from "node:path";
import type { NextConfig } from "next";
import "./src/env.ts";

const nextConfig: NextConfig = {
  // standalone-сборка нужна для лёгкого Docker-образа (см. Dockerfile ниже)
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,

  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      { protocol: "https", hostname: "npo-polet.ru", pathname: "/media/**" },
      {
        protocol: "https",
        hostname: "www.npo-polet.ru",
        pathname: "/media/**",
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
      {
        source: "/_next/static/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
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
