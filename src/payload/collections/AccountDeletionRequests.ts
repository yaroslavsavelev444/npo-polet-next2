import type { CollectionConfig } from "payload";
import { isAdminOrSuperAdmin } from "../access/isAdminOrSuperAdmin.ts";

/**
 * Immutable operational/audit record for an account deletion request.
 *
 * `user` is deliberately nullable: it is cleared in the same database
 * transaction that deletes the account. `subjectReference` is an HMAC, not an
 * identifier, and is retained only as a minimal proof that the request was
 * processed.
 */
export const AccountDeletionRequests: CollectionConfig = {
	slug: "account-deletion-requests",
	admin: {
		group: "Система",
		useAsTitle: "subjectReference",
		defaultColumns: ["status", "scheduledFor", "requestedAt", "executedAt"],
		description:
			"Заявки на удаление аккаунта. Доступны только уполномоченным сотрудникам.",
	},
	access: {
		// The public UI uses the application service with an authenticated Payload
		// request; no direct REST/Admin API mutations by a user are allowed.
		read: isAdminOrSuperAdmin,
		create: () => false,
		update: isAdminOrSuperAdmin,
		delete: () => false,
	},
	fields: [
		{
			name: "user",
			type: "relationship",
			relationTo: "users",
			index: true,
			admin: { position: "sidebar", readOnly: true },
		},
		{
			name: "subjectReference",
			type: "text",
			required: true,
			index: true,
			admin: {
				readOnly: true,
				description: "Односторонний HMAC для минимального журнала исполнения",
			},
		},
		{
			name: "status",
			type: "select",
			required: true,
			defaultValue: "pending",
			index: true,
			options: [
				{ label: "Ожидает окончания периода", value: "pending" },
				{ label: "Отменена пользователем", value: "cancelled" },
				{ label: "Выполняется", value: "executing" },
				{ label: "Выполнена", value: "completed" },
				{ label: "Требует ручной обработки", value: "failed" },
			],
			admin: { position: "sidebar", readOnly: true },
		},
		{
			name: "requestedAt",
			type: "date",
			required: true,
			index: true,
			admin: { readOnly: true },
		},
		{
			name: "scheduledFor",
			type: "date",
			required: true,
			index: true,
			admin: { readOnly: true },
		},
		{ name: "cancelledAt", type: "date", admin: { readOnly: true } },
		{ name: "executedAt", type: "date", admin: { readOnly: true } },
		{
			name: "executionLeaseUntil",
			type: "date",
			admin: {
				readOnly: true,
				description: "Защита от параллельного выполнения worker-ами",
			},
		},
		{
			name: "executionAttempts",
			type: "number",
			defaultValue: 0,
			admin: { readOnly: true },
		},
		{
			name: "lastErrorCode",
			type: "text",
			admin: {
				readOnly: true,
				description: "Технический код без персональных данных",
			},
		},
		{
			name: "retentionJustification",
			type: "textarea",
			required: true,
			defaultValue:
				"Минимальный журнал исполнения права субъекта данных; персональные данные и связь с аккаунтом удаляются после завершения.",
			admin: { readOnly: true },
		},
	],
};
