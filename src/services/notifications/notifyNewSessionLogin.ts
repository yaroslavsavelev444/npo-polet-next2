import {
  emailService,
  newSessionLoginEmailTemplate,
} from "../../services/email";
import { getEmailConfig } from "../../services/email/config";
import { emailLogger } from "../../services/email/logger";

export async function notifyNewSessionLogin(params: {
  email: string;
  userName: string;
  deviceLabel: string;
  ip: string;
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
