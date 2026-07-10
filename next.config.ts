import path from "node:path";
import type { NextConfig } from "next";
import "./src/env.ts";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,

  images: {
    remotePatterns: [
      {
        protocol: "http",
        hostname: "localhost",
        port: "", // Leave blank if no specific port is used in your image URLs
        pathname: "/api/media/file/**", // Optional: restrict to specific paths
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
