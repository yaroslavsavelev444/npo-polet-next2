import path from "node:path";
import type { NextConfig } from "next";
import "./src/env.ts";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,

  images: {
    formats: ["image/avif", "image/webp"],
    // Критично для локальной разработки: Payload отдаёт медиа с того же
    // Next.js-сервера (localhost/127.0.0.1), а Next.js по умолчанию
    // блокирует image-optimizer от обращения к private/loopback IP как
    // защиту от SSRF (images.dangerouslyAllowLocalIP=false по умолчанию).
    // В проде serverURL указывает на реальный публичный домен
    // (npo-polet.ru), поэтому там private IP никогда не возникнет —
    // включаем флаг СТРОГО только для dev, чтобы не ослаблять защиту в бою.
    dangerouslyAllowLocalIP: process.env.NODE_ENV !== "production",
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
      // Прод: без этого паттерна картинки в проде всегда будут падать
      // с "hostname not configured", независимо от того, что исправлено
      // в serverURL.
      //
      // www.npo-polet.ru сюда намеренно не добавлен: nginx редиректит www на
      // голый домен ещё до того, как запрос доходит до приложения (см.
      // nginx.txt), а NEXT_PUBLIC_APP_URL/baseURL везде настроены на голый
      // домен — сам код никогда не строит абсолютный URL картинки с www.
      {
        protocol: "https",
        hostname: "npo-polet.ru",
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

  experimental: {
    // По умолчанию Next.js буферизует тело запроса через proxy лимитом 10MB
    // и молча обрезает всё, что больше, без ошибки клиенту. Загрузка
    // видео-фона Hero через /api/media (Payload REST) легко превышает это,
    // поэтому лимит поднят под короткие сжатые ролики.
    proxyClientMaxBodySize: "30mb",
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
