import { NextRequest, NextResponse } from "next/server";

// ── Защищённые пути (требуют авторизацию и 2FA) ──────────────────────────────
const PROTECTED_PATHS = ["/profile", "/orders", "/leave-review"];

// Путь OTP — доступен только авторизованным, у которых 2FA ещё не пройдена
const OTP_PATH = "/auth/verify-otp";

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const host = req.headers.get("host")?.split(":")[0] ?? "";
  const adminHost = process.env.ADMIN_HOSTNAME; // напр. admin.npo-polet.ru

  if (adminHost) {
    const isAdminRoute =
      pathname.startsWith("/admin") ||
      pathname.startsWith("/api") ||
      pathname.startsWith("/_next") ||
      pathname.includes(".");

    if (host === adminHost) {
      // На admin-домене доступны только панель и Payload API
      if (!isAdminRoute) {
        return NextResponse.redirect(new URL("/admin", req.url));
      }
    } else {
      // На витрине /admin полностью недоступен
      if (pathname.startsWith("/admin")) {
        return NextResponse.rewrite(new URL("/404", req.url));
      }
    }
  }

  const redirectedFrom = req.nextUrl.searchParams.get("_r");
  if (redirectedFrom === pathname) {
    // Что-то пошло не так — не редиректим повторно на тот же путь,
    // пропускаем дальше, чтобы не зациклиться
    return NextResponse.next();
  }

  console.log("[PROXY]", pathname);

  // ── 1. Служебные пути ── пропускаем без проверок ──────────────────────────
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/payload") ||
    pathname.startsWith("/api/auth/session-status") ||
    pathname.startsWith("/admin") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const payloadToken = req.cookies.get("payload-token")?.value;
  const sessionId = req.cookies.get("session-id")?.value;

  console.log("[PROXY]", {
    pathname,
    hasPayloadToken: !!payloadToken,
    hasSessionId: !!sessionId,
  });

  // ── 2. Проверяем, является ли путь защищённым ──────────────────────────────
  const isProtected = PROTECTED_PATHS.some((path) => pathname.startsWith(path));

  // ── 3. Если путь НЕ защищён — пропускаем без дополнительных проверок ──────
  if (!isProtected) {
    // Единственное исключение: /auth/verify-otp требует токена, но не требует 2FA
    if (pathname === OTP_PATH) {
      // Если нет токена — редирект на логин
      if (!payloadToken) {
        const loginUrl = new URL("/auth/login", req.url);
        loginUrl.searchParams.set("from", pathname);
        return NextResponse.redirect(loginUrl);
      }
      // Токен есть — проверяем сессию и статус 2FA
      const status = await fetchSessionStatus(req, sessionId);
      if (!status) {
        // Сессия невалидна — чистим куки и на логин
        const response = NextResponse.redirect(new URL("/auth/login", req.url));
        response.cookies.delete("payload-token");
        response.cookies.delete("session-id");
        return response;
      }
      // Если 2FA уже пройдена — редирект на профиль (незачем сидеть на OTP)
      if (status.twoFAVerified) {
        return NextResponse.redirect(new URL("/profile", req.url));
      }
      // Иначе (2FA не пройдена) — показываем страницу ввода OTP
      return NextResponse.next();
    }

    // Все остальные публичные пути — пропускаем
    return NextResponse.next();
  }

  // ── 4. Защищённый путь: проверяем наличие токена ──────────────────────────
  if (!payloadToken) {
    const loginUrl = new URL("/auth/login", req.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // ── 5. Проверяем статус сессии через Route Handler ─────────────────────────
  // Middleware работает в Edge Runtime — не имеет доступа к Payload Local API.
  // Поэтому делаем fetch к /api/auth/session-status (Node.js runtime).
  const status = await fetchSessionStatus(req, sessionId);

  if (!status) {
    // JWT есть, но сессия отозвана или истекла → чистим куки и на логин
    const response = NextResponse.redirect(new URL("/auth/login", req.url));
    response.cookies.delete("payload-token");
    response.cookies.delete("session-id");
    return response;
  }

  // ── 6. Авторизован, но 2FA не пройден ──────────────────────────────────────
  if (!status.twoFAVerified) {
    // Если это не сам OTP-путь — редиректим на него
    if (pathname !== OTP_PATH) {
      return NextResponse.redirect(new URL(OTP_PATH, req.url));
    }
    // Если мы уже на OTP-пути — пропускаем (пользователь вводит код)
    return NextResponse.next();
  }

  // ── 7. Всё хорошо: авторизован и 2FA пройдена ─────────────────────────────
  return NextResponse.next();
}

// ── fetchSessionStatus ────────────────────────────────────────────────────────

async function fetchSessionStatus(
  req: NextRequest,
  sessionId: string | undefined,
): Promise<{ twoFAVerified: boolean } | null> {
  try {
    const url = new URL("/api/auth/session-status", req.url);
    if (sessionId) {
      url.searchParams.set("sessionId", sessionId);
    }

    const res = await fetch(url, {
      headers: {
        // Передаём cookies чтобы Route Handler видел payload-token
        cookie: req.headers.get("cookie") ?? "",
      },
      cache: "no-store",
    });

    if (!res.ok) return null;
    return res.json();
  } catch {
    // При любой ошибке сети/timeout — возвращаем null → редирект на логин
    return null;
  }
}

// ── Matcher ───────────────────────────────────────────────────────────────────
// Указываем на каких путях запускать middleware.
// Исключаем статику Next.js явно — это быстрее чем проверка в коде.
export const config = {
  matcher: [
    /*
     * Запускаем на всех путях КРОМЕ:
     * - _next/static  — статические файлы Next.js
     * - _next/image   — оптимизация изображений
     * - favicon.ico
     * - файлы с расширением (svg, png, jpg и т.д.)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
