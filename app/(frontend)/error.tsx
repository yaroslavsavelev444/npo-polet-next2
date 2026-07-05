"use client";

import { useEffect } from "react";
import { ErrorPage, logError } from "@/modules/error";

export default function Error({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  useEffect(() => {
    logError(error, { component: "frontend-error" });
  }, [error]);

  return (
    <ErrorPage
      code="500"
      title="Произошла ошибка"
      description="Во время обработки запроса возникла непредвиденная ошибка."
      retry={reset}
      showBackButton
    />
  );
}
