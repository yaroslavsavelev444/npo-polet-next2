"use client";

import { useEffect } from "react";
import { logError } from "@/modules/error";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  useEffect(() => {
    logError(error, { component: "global-error" });
  }, [error]);

  return (
    <html lang="ru">
      <body>
        <div
          style={{
            display: "grid",
            placeItems: "center",
            minHeight: "100vh",
            padding: "2rem",
            fontFamily: "var(--font-sans, sans-serif)",
          }}
        >
          <div style={{ textAlign: "center" }}>
            <h1 style={{ fontSize: "clamp(2rem, 5vw, 4rem)", margin: 0 }}>
              Критическая ошибка
            </h1>
            <p style={{ fontSize: "1.25rem", color: "#6b7280" }}>
              Не удалось загрузить приложение. Попробуйте обновить страницу.
            </p>
            <button
              onClick={reset}
              style={{
                marginTop: "1.5rem",
                padding: "0.75rem 2rem",
                borderRadius: "8px",
                border: "none",
                background: "#4F46E5",
                color: "#fff",
                fontSize: "1rem",
                cursor: "pointer",
              }}
            >
              Повторить
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
