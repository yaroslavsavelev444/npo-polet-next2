import { getEmailConfig } from "../../services/email/config.ts";
import {
  emailService,
  passwordResetEmailTemplate,
} from "../../services/email/index.ts";
import { emailLogger } from "../../services/email/logger.ts";

/**
 * Заменяет письмо, которое раньше (никогда, на практике) отправлялось через
 * встроенный payload.forgotPassword() — тот использует СОБСТВЕННЫЙ email-
 * адаптер Payload (payload.config.ts email:), который в проекте не
 * настроен, поэтому Payload молча писал в консоль
 * "Email attempted without being configured" вместо реальной отправки (см.
 * node_modules/payload/dist/email/consoleEmailAdapter.js). forgotPasswordAction
 * теперь вызывает payload.forgotPassword({ disableEmail: true, ... }) —
 * только чтобы сгенерировать и сохранить токен — и шлёт письмо сам через
 * тот же централизованный EmailService/Nodemailer, что и все остальные
 * письма в проекте.
 */
export async function notifyPasswordReset(params: {
  email: string;
  token: string;
  expiresInMinutes?: number;
}): Promise<void> {
  try {
    const { appUrl } = getEmailConfig();
    await emailService.send(
      passwordResetEmailTemplate,
      {
        resetUrl: `${appUrl}/auth/password-reset?token=${params.token}`,
        expiresInMinutes: params.expiresInMinutes ?? 60,
      },
      { to: { email: params.email } },
    );
  } catch (error) {
    // forgotPasswordAction всегда отвечает клиенту "успех" независимо от
    // того, найден ли email — это защита от email enumeration (см. её
    // комментарий). Пробрасывать ошибку сюда бессмысленно: caller всё
    // равно не может honestly сообщить о сбое, не сломав этот контракт, —
    // поэтому логируем и не мешаем остальному флоу, как и другие
    // некритичные notify*.ts.
    emailLogger.error("Не удалось отправить письмо восстановления пароля", {
      email: params.email,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
