import { getEmailConfig } from "../../services/email/config.ts";
import {
  emailService,
  passwordChangedEmailTemplate,
} from "../../services/email/index.ts";
import { emailLogger } from "../../services/email/logger.ts";

export async function notifyPasswordChanged(params: {
  email: string;
  userName: string;
}): Promise<void> {
  try {
    const { appUrl } = getEmailConfig();
    await emailService.send(
      passwordChangedEmailTemplate,
      {
        userName: params.userName,
        changedAt: new Date(),
        supportUrl: `${appUrl}/contacts`,
      },
      { to: { email: params.email } },
    );
  } catch (error) {
    // Не критично для завершения операции смены пароля — только логируем.
    emailLogger.error("Не удалось уведомить о смене пароля", {
      email: params.email,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
