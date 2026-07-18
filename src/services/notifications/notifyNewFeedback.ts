import type { BasePayload } from "payload";
import { getEmailConfig } from "../email/config.ts";
import {
	emailService,
	feedbackCreatedAdminEmailTemplate,
} from "../email/index.ts";
import { emailLogger } from "../email/logger.ts";
import { getAdminEmailAddresses } from "../email/recipients/getAdminEmails.ts";

export interface NewFeedbackNotification {
	id: number | string;
	type: string;
	title: string;
	description: string;
	userEmail: string;
}

/**
 * Уведомляет весь персонал (коллекция admins) о новом обращении обратной
 * связи по email. Вызывается из server action после успешного создания
 * записи. Ошибки доставки логируются, но НЕ пробрасываются — для
 * пользователя обращение уже принято, а сбой SMTP не должен превращаться в
 * ошибку отправки формы.
 */
export async function notifyNewFeedback(
	feedback: NewFeedbackNotification,
	payload: BasePayload,
): Promise<void> {
	try {
		const admins = await getAdminEmailAddresses(payload);
		if (admins.length === 0) {
			emailLogger.warn("Новое обращение: нет админов для уведомления", {
				feedbackId: feedback.id,
			});
			return;
		}

		const { appUrl } = getEmailConfig();

		await emailService.send(
			feedbackCreatedAdminEmailTemplate,
			{
				feedbackType: feedback.type,
				title: feedback.title,
				description: feedback.description,
				userEmail: feedback.userEmail,
				adminUrl: `${appUrl}/admin/collections/feedbacks/${feedback.id}`,
			},
			{
				to: admins,
				// Ответить можно прямо из почтового клиента — сразу на автора обращения.
				replyTo: feedback.userEmail,
			},
		);
	} catch (error) {
		emailLogger.error("Не удалось уведомить админов о новом обращении", {
			feedbackId: feedback.id,
			error: error instanceof Error ? error.message : String(error),
		});
	}
}
