export const dynamic = "force-dynamic";
export const revalidate = 0;

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { OtpForm } from "@/modules/auth/components/OtpForm";
import { readPendingAuth } from "@/modules/auth/lib/pendingAuth";

const COPY = {
  login_2fa: {
    title: "Подтверждение входа",
    description: "Введите код, отправленный на",
  },
  email_verify: {
    title: "Подтверждение email",
    description: "Введите код, отправленный на",
  },
} as const;

/**
 * Экран состояния №2: пароль уже проверен, но пользователь ещё НЕ авторизован.
 *
 * Опознаём его по pending-auth челленджу, а не через payload.auth(): токена у
 * него на этом шаге нет и быть не должно (см. login.ts / verifyOtp.ts).
 */
export default async function VerifyOtpPage() {
  // payload-token существует только у полностью авторизованных — им сюда не надо.
  if ((await cookies()).get("payload-token")) {
    redirect("/profile");
  }

  const pending = await readPendingAuth();
  if (!pending) {
    redirect("/auth/login");
  }

  const copy = COPY[pending.type];

  return (
    <OtpForm
      type={pending.type}
      email={pending.email}
      title={copy.title}
      description={copy.description}
    />
  );
}
