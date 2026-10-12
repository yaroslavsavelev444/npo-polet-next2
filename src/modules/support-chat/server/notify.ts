import { sql } from "@payloadcms/db-postgres";
import type { Payload } from "payload";
import { getEmailConfig } from "../../../services/email/config.ts";
import { emailService } from "../../../services/email/EmailService.ts";
import { emailLogger } from "../../../services/email/logger.ts";
import { getAdminEmailAddresses } from "../../../services/email/recipients/getAdminEmails.ts";
import { supportStaffAlertEmailTemplate } from "../../../services/email/templates/support/support-staff-alert.template.ts";
import { notify } from "../../../services/notifications/notificationCenter.ts";
import { SUPPORT_TOPICS } from "../lib/constants.ts";
import type { ConversationRecord } from "./conversations.db.ts";
import { drizzleOf, queryOne } from "./db.ts";

/**
 * Уведомления чата за пределами самого чата.
 *
 *  • Покупателю — только колокольчик на сайте, когда менеджер ответил, а
 *    покупатель не на сайте. Писем покупателю нет (решение владельца).
 *  • Персоналу — письма: новый диалог, когда на месте никого; покупатель
 *    ждёт дольше срока.
 *
 * Ни в уведомлении, ни в письме нет текста переписки: оба хранятся и ходят
 * открытыми, а переписка — зашифрована.
 *
 * Ничего здесь не бросает наружу: сбой почты не должен мешать доставке
 * сообщения в чат.
 */

const TOPIC_LABEL: Record<string, string> = Object.fromEntries(
	SUPPORT_TOPICS.map((topic) => [topic.value, topic.label]),
);

/**
 * Ссылка на диалог в консоли. Консоль живёт на хосте админки, если он
 * выделен (ADMIN_HOSTNAME): на хосте витрины /admin отдаёт 404 (proxy.ts).
 */
export function consoleUrl(conversationId: number): string {
	const adminHost = process.env.ADMIN_HOSTNAME;
	const base = adminHost ? `https://${adminHost}` : getEmailConfig().appUrl;
	return `${base.replace(/\/$/, "")}/admin/support?c=${conversationId}`;
}

export async function alertStaff(
	payload: Payload,
	kind: "new" | "overdue",
	record: ConversationRecord,
	waitingMinutes?: number,
): Promise<void> {
	try {
		const to = await getAdminEmailAddresses(payload);
		if (to.length === 0) return;
		await emailService.send(
			supportStaffAlertEmailTemplate,
			{
				kind,
				conversationId: record.id,
				customerName: record.customer?.name || "Покупатель",
				topic: TOPIC_LABEL[record.topic] ?? record.topic,
				waitingMinutes,
				consoleUrl: consoleUrl(record.id),
			},
			{ to },
		);
	} catch (error) {
		emailLogger.error("Чат поддержки: письмо персоналу не отправлено", {
			conversationId: record.id,
			kind,
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

/**
 * Колокольчик «менеджер ответил». Одно непрочитанное такое уведомление на
 * покупателя: пять ответов подряд — не пять уведомлений.
 */
export async function notifyCustomerReply(
	payload: Payload,
	userId: number,
	conversationId: number,
): Promise<void> {
	try {
		const existing = await queryOne(
			drizzleOf(payload),
			sql`SELECT 1 FROM notifications
				WHERE user_id = ${userId} AND type = 'chat' AND is_read = FALSE
				LIMIT 1`,
		);
		if (existing) return;
		await notify(payload, userId, "support_reply", { conversationId });
	} catch (error) {
		console.warn("[support-chat] уведомление покупателю не создано", {
			conversationId,
			error: error instanceof Error ? error.message : String(error),
		});
	}
}
