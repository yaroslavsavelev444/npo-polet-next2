import { accountLockedEmailTemplate, emailService } from "../../services/email";
import { emailLogger } from "../../services/email/logger";

export async function notifyAccountLocked(params: {
  email: string;
  userName: string;
  lockedUntil: Date;
}): Promise<void> {
  try {
    await emailService.send(
      accountLockedEmailTemplate,
      { userName: params.userName, lockedUntil: params.lockedUntil },
      { to: { email: params.email } },
    );
  } catch (error) {
    emailLogger.error("Не удалось уведомить о блокировке аккаунта", {
      email: params.email,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
