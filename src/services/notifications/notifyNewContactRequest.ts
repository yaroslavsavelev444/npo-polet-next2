import type { BasePayload } from "payload";
import { getEmailConfig } from "../email/config.ts";
import {
	contactRequestAdminEmailTemplate,
	emailService,
} from "../email/index.ts";
import { emailLogger } from "../email/logger.ts";
import { getAdminEmailAddresses } from "../email/recipients/getAdminEmails.ts";

export interface NewContactRequestNotification {
	id: number | string;
	name: string;
	email: string;
	message: string;
	consentAcceptedAt: Date;
	consentDocument: string;
}

/**
 * Уведомляет персонал (коллекция admins — и `admin`, и `superadmin`) о новом
 * сообщении со страницы контактов.
 *
 * Вызывается из server action ПОСЛЕ успешного создания записи. Ошибки
 * доставки логируются, но НЕ пробрасываются: для отправителя сообщение уже
 * принято и лежит в базе, и сбой SMTP не должен превращаться в «форма не
 * отправилась» — иначе он отправит его второй раз, и в админке появится дубль.
 */
export async function notifyNewContactRequest(
	request: NewContactRequestNotification,
	payload: BasePayload,
): Promise<void> {
	try {
		const admins = await getAdminEmailAddresses(payload);
		if (admins.length === 0) {
			emailLogger.warn(
				"Новое обращение с /contacts: нет админов для уведомления",
				{
					contactRequestId: request.id,
				},
			);
			return;
		}

		const { appUrl } = getEmailConfig();

		await emailService.send(
			contactRequestAdminEmailTemplate,
			{
				name: request.name,
				email: request.email,
				message: request.message,
				consentAcceptedAt: request.consentAcceptedAt.toISOString(),
				consentUrl: `${appUrl}/consents/${request.consentDocument}`,
				adminUrl: `${appUrl}/admin/collections/contact-requests/${request.id}`,
			},
			{
				to: admins,
				// Ответить можно прямо из почтового клиента — сразу отправителю.
				replyTo: request.email,
			},
		);
	} catch (error) {
		emailLogger.error("Не удалось уведомить админов о сообщении с /contacts", {
			contactRequestId: request.id,
			error: error instanceof Error ? error.message : String(error),
		});
	}
}
