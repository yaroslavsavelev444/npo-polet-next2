import type { CollectionConfig } from "payload";
import { isAdminOrSuperAdmin } from "../access/isAdminOrSuperAdmin.ts";
import { ownedByUserOrStaff } from "../access/ownership.ts";

/**
 * Доверенные устройства — браузеры, которым разрешено входить без OTP.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ПОЧЕМУ ОТДЕЛЬНАЯ КОЛЛЕКЦИЯ, А НЕ ПОЛЯ В `sessions`
 * ────────────────────────────────────────────────────────────────────────────
 * Запись в `sessions` — это ОДИН ВХОД: она живёт 7 суток, отзывается при
 * выходе и после истечения не возвращается. Доверие к устройству живёт
 * дольше входа и переживает его завершение — иначе механизм не решал бы
 * задачу, ради которой заведён (сессия истекла → войти снова → снова код).
 * Слитые в одну таблицу, эти два срока жизни немедленно начали бы спорить:
 * `revoked` означал бы одновременно «вышел с устройства» и «устройству больше
 * не доверяем», а это разные события с разными последствиями.
 *
 * При этом привязка к `sessions` — жёсткая и обязательная: поле `session`
 * всегда указывает на вход, в котором доверие было выдано или в последний раз
 * применено. Оно и даёт аудит «каким входом это устройство пользовалось
 * последний раз», и связывает список доверенных устройств в кабинете с
 * привычным списком активных.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ЧТО ЗДЕСЬ ХРАНИТСЯ, А ЧТО НЕТ
 * ────────────────────────────────────────────────────────────────────────────
 * Секрета cookie здесь НЕТ и быть не может: лежит только его SHA-256
 * (`tokenHash`). Утечка дампа базы не даёт войти ни на одном устройстве —
 * по хешу восстановить предъявляемое значение нельзя. Ровно по этой же
 * причине в `previousTokenHash` лежит хеш, а не прошлый секрет.
 *
 * `ipPrefix` — это ПРЕФИКС СЕТИ (/24 или /64), а не адрес: он и нужен только
 * для сравнения «та же сеть», а хранить точный адрес там, где достаточно
 * подсети, значит хранить больше персональных данных, чем требуется. Точный
 * адрес последнего входа остаётся в `lastIp` — он показывается владельцу в
 * кабинете и нужен ему, чтобы опознать чужое устройство.
 */
export const TrustedDevices: CollectionConfig = {
	slug: "trusted-devices",

	admin: {
		group: "Пользователи",
		useAsTitle: "deviceLabel",
		defaultColumns: ["user", "deviceLabel", "lastIp", "lastUsedAt", "revoked"],
		description:
			"Браузеры, которым разрешён вход без одноразового кода. Отзыв здесь вернёт запрос кода при следующем входе.",
	},

	access: {
		// Владелец видит только свои устройства («Доверенные устройства» в
		// кабинете), персонал — все. См. ownership.ts.
		read: ownedByUserOrStaff,
		// Только через Local API: документ выдаёт право пропустить второй
		// фактор, и создавать/править его извне нельзя ни владельцу, ни
		// персоналу. Единственный легитимный путь — modules/auth/lib/
		// trustedDevice.ts, который пишет с overrideAccess.
		create: () => false,
		update: () => false,
		delete: isAdminOrSuperAdmin,
	},

	timestamps: true,

	fields: [
		{
			name: "user",
			type: "relationship",
			relationTo: "users",
			required: true,
			index: true,
			label: "Пользователь",
		},
		{
			// Жёсткая привязка к входу: сессия, в которой доверие выдано или в
			// последний раз применено. Обновляется на каждом входе с этого
			// устройства.
			name: "session",
			type: "relationship",
			relationTo: "sessions",
			index: true,
			label: "Сессия",
			admin: { readOnly: true },
		},
		{
			// Открытая часть cookie: по ней ищется запись. Сама по себе прав не
			// даёт — без секрета проверка не проходит.
			name: "deviceId",
			type: "text",
			required: true,
			unique: true,
			index: true,
			label: "Идентификатор устройства",
			admin: { readOnly: true },
		},
		{
			name: "tokenHash",
			type: "text",
			required: true,
			index: true,
			label: "Хеш текущего секрета",
			admin: { readOnly: true, hidden: true },
		},
		{
			// Хеш предыдущего секрета — на время окна ротации. Зачем он нужен и
			// что означает предъявление «ещё более старого» секрета, разобрано в
			// modules/auth/lib/trustedDevice.ts.
			name: "previousTokenHash",
			type: "text",
			index: true,
			label: "Хеш предыдущего секрета",
			admin: { readOnly: true, hidden: true },
		},
		{
			name: "rotatedAt",
			type: "date",
			label: "Секрет обновлён",
			admin: { readOnly: true },
		},
		{
			name: "deviceLabel",
			type: "text",
			label: "Устройство",
			admin: { readOnly: true },
		},
		{
			name: "userAgent",
			type: "text",
			label: "User Agent",
			admin: { readOnly: true },
		},
		{
			// Тип устройства + семейство браузера (см. lib/network.ts). Смена
			// этого значения означает другой браузер, то есть другое устройство.
			name: "fingerprint",
			type: "text",
			required: true,
			label: "Отпечаток браузера",
			admin: { readOnly: true },
		},
		{
			name: "ipPrefix",
			type: "text",
			label: "Подсеть",
			admin: {
				readOnly: true,
				description: "Сеть, из которой устройству разрешён вход без кода",
			},
		},
		{
			name: "lastIp",
			type: "text",
			label: "IP последнего входа",
			admin: { readOnly: true },
		},
		{
			name: "lastUsedAt",
			type: "date",
			required: true,
			label: "Последнее использование",
			admin: { readOnly: true },
		},
		{
			name: "expiresAt",
			type: "date",
			required: true,
			index: true,
			label: "Истекает",
			admin: { readOnly: true },
		},
		{
			name: "revoked",
			type: "checkbox",
			defaultValue: false,
			index: true,
			label: "Доверие отозвано",
		},
		{
			name: "revokedReason",
			type: "select",
			label: "Причина отзыва",
			enumName: "enum_trusted_devices_revoked_reason",
			options: [
				{ label: "Отозвано пользователем", value: "user" },
				{ label: "Смена пароля", value: "password_changed" },
				{ label: "Выход со всех устройств", value: "logout_all" },
				{ label: "Повторное использование старого секрета", value: "reuse" },
				{ label: "Административный", value: "admin" },
			],
		},
	],
};
