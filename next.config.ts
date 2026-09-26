import path from "node:path";
import type { NextConfig } from "next";
import { HTML_LIMITED_BOT_UA_RE } from "next/dist/shared/lib/router/utils/html-bots";
import "./src/env.ts";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,

  // Метаданные (title, canonical, robots) для Googlebot — всегда в <head>.
  //
  // Next 16 стримит результат generateMetadata: если оболочка страницы готова
  // раньше метаданных, теги дописываются в <body>. Блокирующий режим (теги в
  // <head>) получают только «HTML-limited» боты из встроенного списка — туда
  // входит yandex, но НЕ Googlebot: его Next считает ботом, который выполнит
  // JS (см. HEADLESS_BROWSER_BOT_UA_RE в next/dist/shared/lib/router/utils/
  // is-bot.js). Google же принимает rel="canonical" только из <head> исходного
  // HTML. Сейчас теги оказываются в <head> лишь потому, что метаданные
  // успевают раньше оболочки — это совпадение по времени, а не гарантия.
  // Список расширяется, а не заменяется: встроенные боты (yandex, соцсети)
  // сохраняют прежнее поведение (Google-InspectionTool — инструмент проверки
  // URL в Search Console — уже покрыт шаблоном Google-[\w-]+). Цена — чуть
  // больший TTFB только для Googlebot.
  htmlLimitedBots: new RegExp(
    `${HTML_LIMITED_BOT_UA_RE.source}|Googlebot`,
    "i",
  ),

  images: {
    formats: ["image/avif", "image/webp"],

    // Next 16 принимает ТОЛЬКО перечисленные здесь значения quality; всё
    // остальное оптимизатор отклоняет (в dev — предупреждением в консоли, в
    // проде — ошибкой вместо картинки). По умолчанию список равен [75], а в
    // проекте на изображениях стоят 30, 82, 85 и 90 — то есть в бою не
    // открылась бы ни одна из них: фон авторизации (30/90), hero главной
    // (82), карточки товара и медиафон (85). 75 остаётся в списке как
    // значение по умолчанию для <Image> без явного quality.
    //
    // Добавляя новое значение в компоненте, добавьте его и сюда.
    qualities: [30, 75, 82, 85, 90],
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
    // Кастомная 404 для URL, не совпавших ни с одним маршрутом. Без флага
    // такие адреса получают дефолтную страницу Next.js: в проекте два
    // корневых layout'а (витрина и админка Payload), поэтому обычный
    // not-found.tsx внутри группы (frontend) их не перехватывает — см.
    // app/global-not-found.tsx и not-found.md в доках Next.
    globalNotFound: true,

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
