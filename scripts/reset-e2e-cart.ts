/**
 * Возвращает корзину и сохранённые предпочтения тестового покупателя в
 * исходное состояние.
 *
 * Нужен между E2E-тестами: успешное оформление очищает корзину (и,
 * если пользователь попросил, сохраняет получателя с адресом), поэтому
 * следующий тест иначе начинался бы на пустой корзине и предзаполненной
 * форме — то есть проверял бы не то, ради чего написан.
 *
 * Отдельно от seed-скрипта: тот создаёт весь стенд и работает секунды, а
 * этот выполняется перед каждым тестом, меняющим состояние.
 *
 * Запуск: pnpm reset:e2e-cart
 */
import "dotenv/config";
import { getPayload } from "payload";
import config from "../payload.config.ts";
import {
	E2E_COMPANY,
	E2E_USER,
	LEGACY_ORDER_NUMBERS,
} from "./seed-checkout-e2e.ts";

async function main() {
	const payload = await getPayload({ config });

	const { docs: users } = await payload.find({
		collection: "users",
		where: { email: { equals: E2E_USER.email } },
		limit: 1,
		depth: 0,
		overrideAccess: true,
	});
	const user = users[0] as { id: number } | undefined;
	if (!user)
		throw new Error("E2E-пользователь не найден: запустите pnpm seed:e2e");

	const { docs: products } = await payload.find({
		collection: "products",
		where: { title: { like: "E2E Товар" } },
		limit: 10,
		depth: 0,
		sort: "id",
		overrideAccess: true,
	});
	if (products.length === 0) {
		throw new Error("E2E-товары не найдены: запустите pnpm seed:e2e");
	}

	// --empty: сценарий «корзину опустошили в другой вкладке». Заказ в этом
	// состоянии оформляться не должен.
	const items = process.argv.includes("--empty")
		? []
		: products.map((product) => ({
				product: (product as { id: number }).id,
				quantity: 2,
				addedAt: new Date().toISOString(),
			}));

	const { docs: carts } = await payload.find({
		collection: "carts",
		where: { user: { equals: user.id } },
		limit: 1,
		depth: 0,
		overrideAccess: true,
	});

	if (carts[0]) {
		await payload.update({
			collection: "carts",
			id: (carts[0] as { id: number }).id,
			data: { items },
			overrideAccess: true,
		});
	} else {
		await payload.create({
			collection: "carts",
			data: { user: user.id, items },
			overrideAccess: true,
		});
	}

	// Заказы, созданные предыдущими тестами, удаляются.
	//
	// Без этого список заказов покупателя за прогон разрастается, исторические
	// заказы уезжают на вторую страницу пагинации, и тесты обратной
	// совместимости начинают падать по причине, не имеющей отношения к коду.
	// Два заказа со старыми форматами адреса — часть стенда и сохраняются.
	const { docs: staleOrders } = await payload.find({
		collection: "orders",
		where: {
			and: [
				{ user: { equals: user.id } },
				{ orderNumber: { not_in: LEGACY_ORDER_NUMBERS } },
			],
		},
		limit: 200,
		depth: 0,
		overrideAccess: true,
	});

	for (const order of staleOrders) {
		await payload.delete({
			collection: "orders",
			id: (order as { id: number }).id,
			overrideAccess: true,
			context: { isMigration: true },
		});
	}

	// --drop-company: сценарий «организацию удалили, пока оформляли заказ».
	// Проверка принадлежности организации живёт только на сервере, поэтому
	// иначе эту ветку не воспроизвести.
	if (process.argv.includes("--drop-company")) {
		const { docs: companies } = await payload.find({
			collection: "companies",
			where: { companyName: { equals: E2E_COMPANY.name } },
			limit: 1,
			depth: 0,
			overrideAccess: true,
		});
		if (companies[0]) {
			await payload.delete({
				collection: "companies",
				id: (companies[0] as { id: number }).id,
				overrideAccess: true,
			});
		}
		process.exit(0);
	}

	// --keep-preferences: сценарий «второй заказ подряд» проверяет именно
	// автозаполнение из сохранённых данных, поэтому их сносить нельзя.
	if (process.argv.includes("--keep-preferences")) {
		process.exit(0);
	}

	const { docs: prefs } = await payload.find({
		collection: "checkout-preferences",
		where: { user: { equals: user.id } },
		limit: 1,
		depth: 0,
		overrideAccess: true,
	});
	if (prefs[0]) {
		await payload.delete({
			collection: "checkout-preferences",
			id: (prefs[0] as { id: number }).id,
			overrideAccess: true,
		});
	}

	process.exit(0);
}

main().catch((error) => {
	console.error("reset-e2e-cart упал:", error);
	process.exit(1);
});
