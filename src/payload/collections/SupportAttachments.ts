import type { Access, CollectionConfig, Where } from "payload";
import { isAdminOrSuperAdmin } from "../access/isAdminOrSuperAdmin.ts";
import { isStaffUser } from "../access/ownership.ts";

/**
 * Запись видит персонал, загрузивший её покупатель и покупатель, которому
 * её показали.
 *
 * `visibleToUser` проставляется сервисом в момент прикрепления к сообщению,
 * которое видит покупатель, — и только к такому. Вложение внутренней
 * заметки остаётся без него и покупателю недоступно, хотя лежит в его
 * диалоге. Отдельное поле, а не фильтр через диалог и сообщение: условие
 * проверяется на каждую выдачу файла и должно быть одним индексируемым
 * сравнением.
 */
const readOwnOrStaff: Access = ({ req }) => {
	if (!req.user) return false;
	if (isStaffUser(req.user)) return true;
	if (req.user.collection !== "users") return false;
	const where: Where = {
		or: [
			{ uploadedByUser: { equals: req.user.id } },
			{ visibleToUser: { equals: req.user.id } },
		],
	};
	return where;
};

/**
 * Вложения в чате поддержки — только метаданные. Сами файлы зашифрованы и
 * лежат на диске под случайным именем (`storageKey`).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ПОЧЕМУ НЕ UPLOAD-КОЛЛЕКЦИЯ PAYLOAD
 * ────────────────────────────────────────────────────────────────────────────
 * Payload хранит загруженный файл как есть и отдаёт его сам. Переписка
 * конфиденциальна: скан доверенности или фото изделия на объекте не должны
 * читаться ни из бэкапа диска, ни из каталога media. Поэтому загрузку и
 * выдачу делает модуль чата (src/modules/support-chat/server/attachments.ts,
 * /api/support/attachments): изображение перекодируется sharp (EXIF и
 * геометки уходят, вместе с ними — разбор чужих форматов библиотекой
 * image-size, которую использует upload Payload), затем оригинал и
 * превью шифруются собственным ключом вложения.
 *
 * Шифруется и исходное имя файла («Паспорт_Иванов.pdf» — тоже персональные
 * данные). Тип, размер и габариты — открыто: без них не отдать файл и не
 * разметить превью, а содержания они не раскрывают.
 *
 * Загружается до отправки сообщения (без `message`), прикрепляется атомарно
 * с сообщением — только своё и ещё не прикреплённое (messages.db.ts).
 */
export const SupportAttachments: CollectionConfig = {
	slug: "support-attachments",
	labels: {
		singular: "Вложение поддержки",
		plural: "Вложения поддержки",
	},

	admin: {
		useAsTitle: "id",
		defaultColumns: ["id", "conversation", "mimeType", "filesize", "createdAt"],
		group: "Поддержка",
		hidden: true,
	},

	access: {
		read: readOwnOrStaff,
		create: () => false,
		update: () => false,
		delete: isAdminOrSuperAdmin,
	},

	fields: [
		{
			name: "conversation",
			type: "relationship",
			relationTo: "support-conversations",
			index: true,
			label: "Диалог",
		},
		{
			name: "message",
			type: "relationship",
			relationTo: "support-messages",
			index: true,
			label: "Сообщение",
			admin: { description: "Пусто — загружено, но ещё не отправлено." },
		},
		{
			name: "uploadedByUser",
			type: "relationship",
			relationTo: "users",
			index: true,
			label: "Загрузил покупатель",
		},
		{
			name: "uploadedByAdmin",
			type: "relationship",
			relationTo: "admins",
			label: "Загрузил менеджер",
		},
		{
			name: "visibleToUser",
			type: "relationship",
			relationTo: "users",
			index: true,
			label: "Доступно покупателю",
		},
		{ name: "attachedAt", type: "date", label: "Прикреплено" },
		{ name: "mimeType", type: "text", required: true, label: "Тип" },
		{ name: "filesize", type: "number", required: true, label: "Размер, байт" },
		{ name: "width", type: "number", label: "Ширина" },
		{ name: "height", type: "number", label: "Высота" },
		{
			name: "hasThumbnail",
			type: "checkbox",
			defaultValue: false,
			label: "Есть превью",
		},
		{
			name: "storageKey",
			type: "text",
			required: true,
			unique: true,
			label: "Имя на диске",
			// Секреты вложения наружу не отдаются никогда: пишет и читает их только
			// модуль чата сырым SQL.
			access: { read: () => false, create: () => false, update: () => false },
			admin: { hidden: true },
		},
		{
			name: "encryptedName",
			type: "text",
			required: true,
			label: "Исходное имя (зашифровано)",
			// Секреты вложения наружу не отдаются никогда: пишет и читает их только
			// модуль чата сырым SQL.
			access: { read: () => false, create: () => false, update: () => false },
			admin: { hidden: true },
		},
		{
			name: "encryptionKey",
			type: "text",
			required: true,
			label: "Ключ вложения (зашифрован)",
			// Секреты вложения наружу не отдаются никогда: пишет и читает их только
			// модуль чата сырым SQL.
			access: { read: () => false, create: () => false, update: () => false },
			admin: { hidden: true },
		},
	],
};
