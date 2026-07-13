// src/payload/fields/legacyId.ts
import type { Field } from "payload";

// Идентификатор документа в старой MongoDB (ObjectId в виде hex-строки).
// Единственный надёжный якорь для идемпотентной миграции из scripts/db-migrate:
// по нему скрипт определяет "эта запись уже перенесена" (upsert вместо
// create) и резолвит перекрёстные ссылки между сущностями (например,
// Product.category ищется в новой БД по legacyId старого category ObjectId).
// Не required и unique (а не sparse-emulated) — записи, созданные вручную в
// новой админке, просто не имеют этого поля, что допустимо: обычный SQL
// UNIQUE не считает несколько NULL коллизией.
export const legacyIdField: Field = {
	name: "legacyId",
	type: "text",
	unique: true,
	index: true,
	admin: {
		position: "sidebar",
		readOnly: true,
		description: "ID документа в старой базе (заполняется только миграцией)",
		condition: (data) => Boolean(data?.legacyId),
	},
	// Пишется только миграционным скриптом через overrideAccess: true.
	// Обычные create/update через REST/GraphQL/админку не могут ни выставить,
	// ни изменить это поле — иначе покупатель мог бы подставить чужой legacyId
	// и, теоретически, вмешаться в логику резолва ссылок при повторном запуске.
	access: {
		create: () => false,
		update: () => false,
	},
};
