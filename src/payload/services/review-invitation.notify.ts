import type { BasePayload } from "payload";
import type { Order } from "../../../payload-types.ts";
import { notify } from "../../services/notifications/notificationCenter.ts";
import { filterReviewableProducts } from "./review-eligibility.ts";

/**
 * Приглашение оценить товары из доставленного заказа — ВНУТРИ САЙТА.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ПОЧЕМУ НЕ ПИСЬМОМ
 * ────────────────────────────────────────────────────────────────────────────
 * Документы на /consents закрывают обработку персональных данных целями,
 * связанными с исполнением заказа, и прямо исключают рассылки: «Обработка ПД
 * не осуществляется для маркетинговых целей, рассылок рекламы… или иных целей,
 * не связанных напрямую с исполнением заказа» (personal-data п. 3; то же в
 * privacy п. 2, user-agreement п. 7.2, offer п. 9.2, terms п. 14.3). Письмо с
 * приглашением оставить отзыв в эти цели не попадает — заказ к моменту
 * приглашения уже исполнен.
 *
 * Внутрисайтовое уведомление под этот запрет не подпадает: оно не
 * распространяется по сетям электросвязи и не является новой целью обработки —
 * это функциональность кабинета, куда пользователь приходит сам. Поэтому файл
 * лежит рядом с notificationCenter, а НЕ рядом с notify*.ts: те отправляют
 * почту, этот принципиально её не трогает.
 *
 * Появится отдельное согласие на такие сообщения — письмо добавится рядом, не
 * меняя ничего здесь: повод и состав получателей уже посчитаны.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ЧТО ПРОВЕРЯЕТСЯ ПЕРЕД ПРИГЛАШЕНИЕМ
 * ────────────────────────────────────────────────────────────────────────────
 * Приглашение обязано открывать НЕПУСТОЙ список. Поэтому оно создаётся только
 * если в заказе есть хотя бы один товар, который сейчас продаётся и о котором
 * пользователь ещё не высказался, — по тому же правилу, что наполняет раздел
 * «Можно оценить» (filterReviewableProducts). Заказ, целиком состоящий из
 * снятых с продажи товаров, приглашения не даёт.
 */

/** Идентификаторы товаров заказа — из документа, каким его отдал хук. */
function orderProductIds(order: Order): number[] {
	const ids: number[] = [];
	for (const item of order.items ?? []) {
		const { product } = item;
		const id =
			typeof product === "number"
				? product
				: product && typeof product === "object"
					? Number(product.id)
					: Number.NaN;
		if (Number.isFinite(id)) ids.push(id);
	}
	return ids;
}

/**
 * Уже приглашали по этому заказу?
 *
 * Статус заказа в админке — обычный выпадающий список без ограничений на
 * переходы, поэтому «доставлен → отправлен → доставлен» вполне возможно, и
 * без этой проверки каждый такой возврат давал бы ещё одно приглашение по
 * тому же заказу.
 *
 * Отбор идёт по `link`: этот адрес есть только у приглашений, и, в отличие от
 * заголовка, он не изменится при правке формулировки. Номер заказа лежит в
 * `data` — JSON-поле, по которому фильтровать на стороне БД нельзя, поэтому
 * сверка идёт в памяти по ограниченному окну последних приглашений. Окна в сто
 * записей хватает: это сто доставленных заказов одного покупателя, а цена
 * промаха — одно лишнее уведомление, а не письмо.
 */
const INVITATION_LINK = "/profile/reviews?status=to-review";

async function alreadyInvited(
	payload: BasePayload,
	userId: number,
	orderNumber: string,
): Promise<boolean> {
	const { docs } = await payload.find({
		collection: "notifications",
		where: {
			and: [
				{ user: { equals: userId } },
				{ type: { equals: "review" } },
				{ link: { equals: INVITATION_LINK } },
			],
		},
		sort: "-createdAt",
		limit: 100,
		depth: 0,
		overrideAccess: true,
	});

	return docs.some(
		(doc) =>
			(doc.data as { orderNumber?: unknown } | null)?.orderNumber ===
			orderNumber,
	);
}

/**
 * Создаёт приглашение оценить товары доставленного заказа, если повод есть.
 *
 * Никогда не бросает: приглашение — не та ценность, ради которой стоит ронять
 * сохранение заказа. Тот же принцип, что у notify() и у писем о статусе.
 */
export async function inviteToReviewDeliveredOrder(
	payload: BasePayload,
	order: Order,
): Promise<void> {
	try {
		// Заказ, обезличенный после удаления аккаунта: адресата нет, и
		// придумывать его нельзя.
		const { user } = order;
		const userId =
			typeof user === "number"
				? user
				: user && typeof user === "object"
					? Number(user.id)
					: Number.NaN;
		if (!Number.isFinite(userId)) return;

		const productIds = orderProductIds(order);
		if (productIds.length === 0) return;

		// Проверка повтора идёт ПЕРЕД выборкой товаров: она дешевле и чаще
		// срабатывает на возврате статуса, ради которого и введена.
		if (await alreadyInvited(payload, userId, order.orderNumber)) return;

		const reviewable = await filterReviewableProducts(
			payload,
			userId,
			productIds,
		);
		if (reviewable.length === 0) return;

		await notify(payload, userId, "review_invitation", {
			orderNumber: order.orderNumber,
			productCount: reviewable.length,
		});
	} catch (error) {
		console.error(
			"[reviews] не удалось пригласить оценить доставленный заказ",
			error,
		);
	}
}
