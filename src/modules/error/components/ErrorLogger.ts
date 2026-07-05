export function logError(error: Error, context?: Record<string, unknown>) {
  // В продакшене можно отправлять в Sentry / LogRocket / etc.
  console.error("[ErrorModule]", error, context);

  // Пример интеграции с Sentry (раскомментировать при необходимости)
  // if (typeof window !== "undefined" && window.Sentry) {
  //   window.Sentry.captureException(error, { extra: context });
  // }
}
