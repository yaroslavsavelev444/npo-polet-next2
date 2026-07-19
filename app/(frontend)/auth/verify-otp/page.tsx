export const dynamic = "force-dynamic";
export const revalidate = 0;

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AuthShell } from "@/modules/auth/components/AuthShell";
import { OtpForm } from "@/modules/auth/components/OtpForm";
import { readPendingAuth } from "@/modules/auth/lib/pendingAuth";
import { getCachedSettings } from "@/payload/services/settings.service";
import { getAuthImages } from "@/utils/settings-helpers";

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

  const settings = await getCachedSettings();
  const { loginUrl, registerUrl } = getAuthImages(settings);
  // email_verify относится к регистрации, login_2fa — ко входу.
  const isRegister = pending.type === "email_verify";

  return (
    <AuthShell
      imageUrl={isRegister ? registerUrl : loginUrl}
      imageAlt={isRegister ? "Подтверждение регистрации" : "Подтверждение входа"}
      variant={isRegister ? "register" : "login"}
    >
      <OtpForm
        type={pending.type}
        email={pending.email}
        title={copy.title}
        description={copy.description}
      />
    </AuthShell>
  );
}
