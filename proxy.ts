import { NextRequest, NextResponse } from "next/server";
import { PENDING_AUTH_COOKIE } from "./src/modules/auth/lib/pendingAuth.ts";
import { resolveSessionStatus } from "./src/modules/auth/lib/session.ts";
import { getPayloadInstance } from "./src/payload/services/getPayload.ts";

// ── Защищённые пути (требуют завершённой авторизации) ────────────────────────
const PROTECTED_PATHS = ["/profile", "/orders", "/leave-review"];

// Путь OTP — доступен только тем, кто ввёл пароль, но ещё не подтвердил код
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

  // Три состояния пользователя различимы уже по cookies:
  // 1. нет ничего                     — не авторизован
  // 2. только pending-auth челлендж   — пароль введён, OTP ещё не подтверждён
  // 3. payload-token                  — полностью авторизован (токен выдаётся
  //                                     ТОЛЬКО после успешного OTP,
  //                                     см. verifyOtp.ts)
  const payloadToken = req.cookies.get("payload-token")?.value;
  const sessionId = req.cookies.get("session-id")?.value;
  const hasPendingAuth = req.cookies.has(PENDING_AUTH_COOKIE);

  console.log("[PROXY]", {
    pathname,
    hasPayloadToken: !!payloadToken,
    hasSessionId: !!sessionId,
    hasPendingAuth,
  });

  // ── 2. Проверяем, является ли путь защищённым ──────────────────────────────
  const isProtected = PROTECTED_PATHS.some((path) => pathname.startsWith(path));

  // ── 3. Если путь НЕ защищён — пропускаем без дополнительных проверок ──────
  if (!isProtected) {
    // Единственное исключение: /auth/verify-otp — экран состояния №2
    if (pathname === OTP_PATH) {
      // Уже полностью авторизован — на OTP делать нечего
      if (payloadToken) {
        return NextResponse.redirect(new URL("/profile", req.url));
      }
      // Нет незавершённого входа — вводить нечего, отправляем на логин
      if (!hasPendingAuth) {
        const loginUrl = new URL("/auth/login", req.url);
        loginUrl.searchParams.set("from", pathname);
        return NextResponse.redirect(loginUrl);
      }
      // Пароль введён, код ждёт — показываем страницу ввода OTP
      return NextResponse.next();
    }

    // Все остальные публичные пути — пропускаем
    return NextResponse.next();
  }

  // ── 4. Защищённый путь: проверяем наличие токена ──────────────────────────
  if (!payloadToken) {
    // Состояние №2 (челлендж есть, кода ещё не было) — это НЕ авторизация:
    // такому пользователю здесь так же нечего делать, как и гостю. Отправляем
    // дальше вводить код.
    const target = hasPendingAuth ? OTP_PATH : "/auth/login";
    const url = new URL(target, req.url);
    if (!hasPendingAuth) url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }

  // ── 5. Проверяем статус сессии ───────────────────────────────────────────
  // Отдельной проверки 2FA здесь больше нет и не должно быть: payload-token
  // выдаётся только после успешного OTP (см. verifyOtp.ts), поэтому его
  // наличие УЖЕ означает пройденный второй фактор. Раньше гейт опирался на
  // поле users.twoFAVerified, которое остаётся true 24 часа после первого
  // подтверждения — из-за чего при повторном входе в этом окне OTP
  // пропускался полностью.
  const status = await checkSessionStatus(req, sessionId);

  if (!status) {
    // JWT есть, но сессия отозвана или истекла → чистим куки и на логин
    const response = NextResponse.redirect(new URL("/auth/login", req.url));
    response.cookies.delete("payload-token");
    response.cookies.delete("session-id");
    return response;
  }

  // ── 6. Всё хорошо: вход завершён ──────────────────────────────────────────
  return NextResponse.next();
}

// ── checkSessionStatus ─────────────────────────────────────────────────────────
//
// Раньше здесь был fetch() к /api/auth/session-status через публичный домен —
// из предположения, что Proxy выполняется в Edge Runtime и не имеет доступа к
// Payload Local API. Начиная с Next.js 15.5 Proxy по умолчанию выполняется в
// Node.js runtime (см. node_modules/next/dist/docs/.../file-conventions/
// proxy.md, раздел "Runtime") — то есть то же окружение, что и у Server
// Actions/Route Handlers, и Local API доступна напрямую.
//
// Самозапрос через nginx был единственным источником бага "Сессия не
// найдена" сразу после логина: он проходил через тот же процесс (proxy →
// nginx → тот же контейнер), но был подвержен транзиентным сбоям — и при
// любом сбое (включая сетевой, не только "сессия правда невалидна") вызывающий
// код удалял payload-token/session-id, вместе с которыми терялся только что
// начатый вход. Прямой вызов Local API убирает саму возможность такого сбоя.

async function checkSessionStatus(
  req: NextRequest,
  sessionId: string | undefined,
): Promise<{ userId: string } | null> {
  const payload = await getPayloadInstance();
  const status = await resolveSessionStatus(payload, req.headers, sessionId);
  return status ? { userId: status.userId } : null;
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
