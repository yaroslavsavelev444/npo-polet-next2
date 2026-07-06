import { OTP_TTL_MS } from "../../modules/auth/lib/otp";
import { emailService, otpEmailTemplate } from "../../services/email";
import { emailLogger } from "../../services/email/logger";
import type { OtpEmailPurpose } from "../../services/email/templates/auth/otp-code.template";

/**
 * Заменяет прежний sendOtpEmail() из modules/auth/lib/email.ts — та же
 * точка вызова (createOtp -> sendOtpEmail), но теперь через централизованный
 * EmailService вместо прямого использования Resend SDK.
 */
export async function notifyOtpCode(params: {
  to: string;
  code: string;
  purpose: OtpEmailPurpose;
}): Promise<void> {
  try {
    await emailService.send(
      otpEmailTemplate,
      {
        purpose: params.purpose,
        code: params.code,
        expiresInMinutes: Math.round(OTP_TTL_MS / 60000),
      },
      { to: { email: params.to } },
    );
  } catch (error) {
    emailLogger.error("Не удалось отправить OTP-код", {
      purpose: params.purpose,
      error: error instanceof Error ? error.message : String(error),
    });
    // OTP — критичный сценарий: пробрасываем ошибку, чтобы вызывающий код
    // (loginAction/registerAction) мог сообщить пользователю о сбое,
    // а не притвориться, что код отправлен.
    throw error;
  }
}
