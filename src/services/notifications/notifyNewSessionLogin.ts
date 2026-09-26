import { getEmailConfig } from "../../services/email/config.ts";
import {
  emailService,
  newSessionLoginEmailTemplate,
} from "../../services/email/index.ts";
import { emailLogger } from "../../services/email/logger.ts";

export async function notifyNewSessionLogin(params: {
  email: string;
  userName: string;
  deviceLabel: string;
  ip: string;
  /**
   * Устройство одновременно стало доверенным. Меняет тему, preview-текст и
   * содержание письма — см. new-session-login.template.ts.
   */
  deviceRemembered?: boolean;
}): Promise<void> {
  try {
    const { appUrl } = getEmailConfig();
    await emailService.send(
      newSessionLoginEmailTemplate,
      {
        userName: params.userName,
        deviceLabel: params.deviceLabel,
        ip: params.ip,
        loginAt: new Date(),
        sessionsUrl: `${appUrl}/profile?tab=sessions`,
        deviceRemembered: params.deviceRemembered ?? false,
      },
      { to: { email: params.email } },
    );
  } catch (error) {
    emailLogger.error("Не удалось уведомить о новом входе", {
      email: params.email,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
