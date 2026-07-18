// scripts/seed-review-demo.ts
//
// Демо-данные для ручной проверки переработанной страницы товара:
// публикует товар 42, вешает несколько изображений, характеристики, отзывы
// (одобренные + на модерации) и завершённый заказ. Только для локальной
// проверки — не для прода.
//
//   node --experimental-strip-types scripts/seed-review-demo.ts

import "dotenv/config";
import path from "node:path";
import { getPayload } from "payload";
import config from "../payload.config.ts";

const PRODUCT_ID = 42;
const MEDIA_DIR = path.resolve(process.cwd(), "media");
const IMAGE_FILES = [
	"989de4b1-170b-4076-b76a-59da6bd1dfbb.png",
	"sosa.png",
	"тушканейро.png",
	"1769430313801-019bfa43-00fe-720f-8dc4-679b4441d534.png",
];

async function main() {
	const payload = await getPayload({ config });

	// 1. Медиа
	const mediaIds: number[] = [];
	for (const file of IMAGE_FILES) {
		const created = await payload.create({
			collection: "media",
			data: { alt: `Демо изображение ${file}` },
			filePath: path.join(MEDIA_DIR, file),
			overrideAccess: true,
		});
		mediaIds.push(created.id as number);
		console.log("media created", created.id, file);
	}

	// 2. Товар: публикуем, добавляем характеристики/габариты/бренд/изображения
	await payload.update({
		collection: "products",
		id: PRODUCT_ID,
		data: {
			title: "Промышленный контроллер «Полёт ПК-500»",
			description:
				"Промышленный программируемый контроллер для автоматизации производственных линий. Защищённый корпус, широкий диапазон рабочих температур, поддержка распространённых промышленных протоколов.\n\nПодходит для модернизации существующих систем и построения новых АСУ ТП.",
			images: mediaIds,
			pricing: {
				priceForIndividual: 84990,
				discount: { isActive: true, type: "percentage", value: 12 },
			},
			inventory: {
				status: "available",
				minOrderQuantity: 1,
				maxOrderQuantity: 20,
				isVisible: true,
			},
			brand: { manufacturer: "НПО Полёт", warrantyMonths: 24 },
			dimensions: { weight: 3.2, length: 22, width: 12, height: 9 },
			specifications: [
				{
					name: "Материал корпуса",
					value: "Алюминиевый сплав",
					group: "Общие характеристики",
					isVisible: true,
				},
				{
					name: "Степень защиты",
					value: "IP65",
					group: "Общие характеристики",
					isVisible: true,
				},
				{
					name: "Рабочая температура",
					value: "−40…+70",
					unit: "°C",
					group: "Общие характеристики",
					isVisible: true,
				},
				{
					name: "Напряжение питания",
					value: "24",
					unit: "В",
					group: "Электропитание",
					isVisible: true,
				},
				{
					name: "Потребляемая мощность",
					value: "15",
					unit: "Вт",
					group: "Электропитание",
					isVisible: true,
				},
				{
					name: "Цифровых входов",
					value: "16",
					group: "Входы / выходы",
					isVisible: true,
				},
				{
					name: "Цифровых выходов",
					value: "12",
					group: "Входы / выходы",
					isVisible: true,
				},
				{
					name: "Интерфейсы",
					value: "RS-485, Ethernet, USB",
					group: "Входы / выходы",
					isVisible: true,
				},
			],
		},
		overrideAccess: true,
		draft: false,
	});
	console.log("product published", PRODUCT_ID);

	// 3. Отзывы (по одному на пользователя). Чистим прежние демо-отзывы.
	const existing = await payload.find({
		collection: "product-reviews",
		where: { product: { equals: PRODUCT_ID } },
		limit: 100,
		overrideAccess: true,
	});
	for (const doc of existing.docs) {
		await payload.delete({
			collection: "product-reviews",
			id: doc.id,
			overrideAccess: true,
		});
	}

	const reviews = [
		{
			user: 16,
			rating: 5,
			status: "approved",
			comment:
				"Отличный контроллер, работает стабильно уже полгода на линии розлива. Монтаж занял час, документация понятная.",
		},
		{
			user: 17,
			rating: 4,
			status: "approved",
			comment:
				"В целом доволен. Хороший запас по входам-выходам, крепкий корпус. Немного смутила прошивка из коробки — обновил до актуальной без проблем.",
		},
		{
			user: 15,
			rating: 3,
			status: "pending",
			comment:
				"Пока тестируем на стенде, отзыв дополню после ввода в эксплуатацию.",
		},
	];
	for (const r of reviews) {
		const created = await payload.create({
			collection: "product-reviews",
			data: {
				user: r.user,
				product: PRODUCT_ID,
				rating: r.rating,
				comment: r.comment,
				status: r.status as "approved" | "pending",
				isVerifiedPurchase: true,
			},
			overrideAccess: true,
		});
		console.log("review", created.id, r.user, r.status);
	}

	// 4. Завершённый заказ для пользователя 12 (даёт право оставить отзыв).
	const order = await payload.create({
		collection: "orders",
		data: {
			orderNumber: "",
			user: 12,
			status: "delivered",
			recipient: {
				fullName: "Тест Покупатель",
				phone: "+70000000000",
				email: "otptest001@example.com",
			},
			delivery: { method: "self_pickup" },
			items: [
				{
					product: PRODUCT_ID,
					name: "Промышленный контроллер «Полёт ПК-500»",
					quantity: 1,
					unitPrice: 84990,
					discount: 0,
					totalPrice: 84990,
				},
			],
			pricing: {
				subtotal: 84990,
				discount: 0,
				shippingCost: 0,
				total: 84990,
				currency: "RUB",
			},
			payment: { method: "invoice", status: "paid" },
			statusHistory: [
				{
					status: "delivered",
					changedAt: new Date().toISOString(),
					comment: "Демо-заказ",
				},
			],
			source: "web",
		},
		overrideAccess: true,
		draft: false,
	});
	console.log("delivered order", order.id, "for user 12");

	console.log("\nDONE. Product 42 seeded.");
	process.exit(0);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
