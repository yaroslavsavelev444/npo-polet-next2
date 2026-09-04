/**
 * Печатает заказ по номеру в JSON — используется E2E-тестами для проверки
 * того, что РЕАЛЬНО записано в базу.
 *
 * Проверять оформление только по экрану недостаточно: заказ — это документ,
 * по которому отгружают товар, и расхождение между показанным и сохранённым
 * адресом заметят уже на складе.
 *
 * Запуск: node --experimental-strip-types scripts/dump-order.ts ORD-2026-000001
 */
import "dotenv/config";
import { getPayload } from "payload";
import config from "../payload.config.ts";

async function main() {
	const orderNumber = process.argv[2];
	if (!orderNumber) throw new Error("Укажите номер заказа");

	const payload = await getPayload({ config });
	const { docs } = await payload.find({
		collection: "orders",
		where: { orderNumber: { equals: orderNumber } },
		limit: 1,
		depth: 1,
		overrideAccess: true,
	});

	if (!docs[0]) throw new Error(`Заказ ${orderNumber} не найден`);

	// Единственная строка в stdout — тест разбирает её как JSON.
	process.stdout.write(`${JSON.stringify(docs[0])}\n`);
	process.exit(0);
}

main().catch((error) => {
	console.error("dump-order упал:", error);
	process.exit(1);
});
