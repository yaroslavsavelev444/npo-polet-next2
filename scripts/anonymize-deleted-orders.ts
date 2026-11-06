/**
 * Дочистка заказов, обезличенных до исправления запроса удаления аккаунта.
 *
 *   pnpm account-deletion:scrub-orders           # только посчитать
 *   pnpm account-deletion:scrub-orders --apply   # очистить, необратимо
 *
 * Запрос обезличивания долго очищал только улицу, город, индекс и страну. У
 * заказов удалённых покупателей остались полный адрес, дом, квартира и
 * координаты, а также трек-номер, заметки менеджера и причины отмены.
 *
 * Скрипт, а не миграция: deploy.sh применяет миграции при каждой выкладке сам, а
 * эта операция необратима и запускается только с согласия владельца. Перед
 * запуском на бою нужен свежий бэкап.
 *
 * Трогает только заказы с адресом вида deleted-order-<id>@example.invalid. Живые
 * заказы и перенесённые без владельца не меняются. Повторный запуск безопасен.
 * Вывод — только количество, без персональных данных.
 */
import "dotenv/config";
import { getPayload } from "payload";
import config from "../payload.config.ts";
import {
	countAnonymizedOrdersWithLeftovers,
	scrubAnonymizedOrders,
} from "../src/modules/account-deletion/lib/order-anonymization.ts";
import { drizzleOf } from "../src/modules/support-chat/server/db.ts";

const apply = process.argv.includes("--apply");

const payload = await getPayload({ config });
const db = drizzleOf(payload);

const before = await countAnonymizedOrdersWithLeftovers(db);
console.log(`Обезличенных заказов с остатками данных: ${before}`);

if (!apply) {
	console.log(
		"Ничего не изменено. Чтобы очистить, запустите с флагом --apply.",
	);
	process.exit(0);
}

await db.transaction((tx) => scrubAnonymizedOrders(tx));

const after = await countAnonymizedOrdersWithLeftovers(db);
console.log(`Очищено. Осталось заказов с данными: ${after}`);
process.exit(after === 0 ? 0 : 1);
