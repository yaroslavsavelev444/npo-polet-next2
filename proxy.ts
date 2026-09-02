import { NextRequest, NextResponse } from "next/server";
import { PENDING_AUTH_COOKIE } from "./src/modules/auth/lib/pendingAuth.ts";
import { resolveSafeRedirect } from "./src/modules/auth/lib/safeRedirect.ts";
import { resolveSessionStatus } from "./src/modules/auth/lib/session.ts";
import { getPayloadInstance } from "./src/payload/services/getPayload.ts";

// ── Защищённые пути (требуют завершённой авторизации) ────────────────────────
const PROTECTED_PATHS = ["/profile", "/orders", "/leave-review"];

// Путь OTP — доступен только тем, кто ввёл пароль, но ещё не подтвердил код
const OTP_PATH = "/auth/verify-otp";

// Гостевые страницы авторизации — доступны ТОЛЬКО неавторизованным. Полностью
// авторизованному пользователю тут делать нечего (verify-otp обрабатывается
// отдельно — это состояние №2, а не гостевая страница).
const GUEST_AUTH_PATHS = [
  "/auth/login",
  "/auth/register",
  "/auth/forgot-password",
  "/auth/password-reset",
];

function isGuestAuthPath(pathname: string): boolean {
  return GUEST_AUTH_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

/**
 * Куда вернуть уже авторизованного пользователя, попавшего на гостевую
 * страницу входа. По возможности — на исходный внутренний путь из ?from=
 * (напр. его прислал сюда гейт защищённого пути), иначе в личный кабинет.
 * Внешние адреса и повторно-гостевые/OTP-пути отбрасываем — иначе open-redirect
 * и петля переадресаций.
 */
function safeRedirectTarget(req: NextRequest): string {
  return resolveSafeRedirect(req.nextUrl.searchParams.get("from"), {
    origin: req.nextUrl.origin,
    fallback: "/profile",
    isDisallowedTarget: (pathname) =>
      isGuestAuthPath(pathname) || pathname === OTP_PATH,
  });
}

/**
 * Строит значение заголовка Content-Security-Policy для одного запроса.
 *
 * script-src — строгий: разрешены только скрипты с этим одноразовым nonce и
 * те, что они сами подгружают ('strict-dynamic'). Это отсекает inline-инъекции
 * (XSS) даже при попадании непроверенного ввода в разметку. Next сам
 * проставляет nonce своим бандлам и компонентам <Script>: он читает CSP из
 * заголовка запроса (см. node_modules/next/dist/docs/.../content-security-
 * policy.md, раздел "How nonces work in Next.js"). Наши inline JSON-LD
 * получают nonce через <JsonLd> (src/shared/components/JsonLd.tsx).
 *
 * style-src — 'unsafe-inline' намеренно: antd/@once-ui и React (inline
 * style=...) вставляют стили в рантайме без nonce, строгий style-src их бы
 * сломал. Риск инъекции стилей несопоставимо ниже скриптовой.
 *
 * mc.yandex.ru — домены Яндекс.Метрики (скрипт грузится только после согласия
 * на аналитические cookie, см. AnalyticsGate).
 *
 * В dev добавляются 'unsafe-eval' (React использует eval для отладки) и ws:
 * (HMR); upgrade-insecure-requests в dev выключен — локалка работает по http.
 */
function buildCsp(nonce: string, isDev: boolean): string {
  const directives = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob: https:`,
    `font-src 'self' data:`,
    `connect-src 'self' https://mc.yandex.ru https://mc.yandex.com${isDev ? " ws: wss:" : ""}`,
    `frame-src 'self' https://mc.yandex.ru`,
    `worker-src 'self' blob:`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'self'`,
    ...(isDev ? [] : [`upgrade-insecure-requests`]),
  ];
  return directives.join("; ");
}

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

  // ── 1. Служебные пути ── пропускаем без проверок и без CSP ────────────────
  // CSP с nonce сюда не вешаем намеренно: /admin — это панель Payload со своим
  // бандлом (строгий script-src мог бы её сломать), а /api и статика — не
  // документы с inline-скриптами. Строгий CSP получают только storefront-
  // страницы ниже.
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/payload") ||
    pathname.startsWith("/api/auth/session-status") ||
    pathname.startsWith("/admin") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // ── CSP: одноразовый nonce на запрос ──────────────────────────────────────
  // Генерируем nonce и кладём его И в заголовок запроса x-nonce (его читает
  // <JsonLd> и сам Next для своих скриптов), И в CSP заголовок ответа. Все
  // storefront-ответы ниже проходят через render()/redirectTo(), чтобы CSP
  // гарантированно попадал на каждый из них.
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce, process.env.NODE_ENV !== "production");
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const applyCsp = (res: NextResponse): NextResponse => {
    res.headers.set("Content-Security-Policy", csp);
    return res;
  };
  // Рендер storefront-страницы: пробрасываем изменённые заголовки запроса
  // (чтобы Next проставил nonce своим скриптам) и вешаем CSP на ответ.
  const render = (): NextResponse =>
    applyCsp(NextResponse.next({ request: { headers: requestHeaders } }));
  const redirectTo = (url: URL): NextResponse =>
    applyCsp(NextResponse.redirect(url));

  const redirectedFrom = req.nextUrl.searchParams.get("_r");
  if (redirectedFrom === pathname) {
    // Что-то пошло не так — не редиректим повторно на тот же путь,
    // пропускаем дальше, чтобы не зациклиться
    return render();
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

  // ── 2. Проверяем, является ли путь защищённым ──────────────────────────────
  const isProtected = PROTECTED_PATHS.some((path) => pathname.startsWith(path));

  // ── 3. Если путь НЕ защищён — пропускаем без дополнительных проверок ──────
  if (!isProtected) {
    // Зеркало защиты ниже (гость → на логин): полностью авторизованному
    // пользователю нечего делать на гостевых страницах входа/регистрации —
    // уводим в кабинет (или на исходный путь из ?from=). Опираемся на наличие
    // payload-token так же, как OTP-гейт: устаревший токен само-починится на
    // защищённом пути (шаг 5 удалит куки и вернёт на логин).
    if (payloadToken && isGuestAuthPath(pathname)) {
      return redirectTo(new URL(safeRedirectTarget(req), req.url));
    }

    // Единственное исключение: /auth/verify-otp — экран состояния №2
    if (pathname === OTP_PATH) {
      // Уже полностью авторизован — на OTP делать нечего
      if (payloadToken) {
        return redirectTo(new URL("/profile", req.url));
      }
      // Нет незавершённого входа — вводить нечего, отправляем на логин
      if (!hasPendingAuth) {
        const loginUrl = new URL("/auth/login", req.url);
        loginUrl.searchParams.set("from", pathname);
        return redirectTo(loginUrl);
      }
      // Пароль введён, код ждёт — показываем страницу ввода OTP
      return render();
    }

    // Все остальные публичные пути — пропускаем
    return render();
  }

  // ── 4. Защищённый путь: проверяем наличие токена ──────────────────────────
  if (!payloadToken) {
    // Состояние №2 (челлендж есть, кода ещё не было) — это НЕ авторизация:
    // такому пользователю здесь так же нечего делать, как и гостю. Отправляем
    // дальше вводить код.
    const target = hasPendingAuth ? OTP_PATH : "/auth/login";
    const url = new URL(target, req.url);
    if (!hasPendingAuth) url.searchParams.set("from", pathname);
    return redirectTo(url);
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
    const response = applyCsp(
      NextResponse.redirect(new URL("/auth/login", req.url)),
    );
    response.cookies.delete("payload-token");
    response.cookies.delete("session-id");
    return response;
  }

  // ── 6. Всё хорошо: вход завершён ──────────────────────────────────────────
  return render();
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
