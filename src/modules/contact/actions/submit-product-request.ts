"use server";

import type { Payload } from "payload";
import { getCurrentUser } from "@/modules/auth/lib/getCurrentUser";
import { RATE_LIMITS } from "@/modules/auth/lib/rateLimit";
import { getRequestMeta } from "@/modules/auth/lib/utils";
import { normalizeRuPhone } from "@/modules/checkout/lib/phone";
import { getProductHrefFromDoc } from "@/modules/productCard/lib/routing";
import { createContactRequest } from "@/payload/services/contact-requests.service";
import { getPayloadInstance } from "@/payload/services/getPayload";
import type { Product } from "@/payload-types";
import { notifyNewContactRequest } from "@/services/notifications/notifyNewContactRequest";
import { captureError } from "@/services/observability/capture";
import { PERSONAL_DATA_CONSENT_SLUG } from "../schemas/contact-request.schema";
import { productRequestSchema } from "../schemas/product-request.schema";

export type ProductRequestActionResult =
	| { success: true }
	| {
			success: false;
			error: string;
			code: "validation" | "not_found" | "rate_limited" | "server_error";
	  };

/**
 * Одинаковая заявка (тот же товар, тот же номер) в течение этого окна
 * считается повтором: двойной клик, повтор после обрыва сети, «а точно
 * ушло?». Покупателю — успех, менеджеру — одна запись вместо трёх.
 */
const DUPLICATE_WINDOW_MS = 10 * 60 * 1000;

/**
 * Заявка на товар, который сейчас нельзя купить.
 *
 * Живёт в той же коллекции contact-requests, что и обращения с контактов и
 * заявки на 3D-печать (тема 'product'): их разбирает один отдел продаж, и
 * отдельная таблица была бы ещё одним местом, куда забывают заглянуть.
 * От прочих обращений её отличает связь с товаром и количество.
 *
 * Порядок и принципы — как у submitContactRequestAction: схема проверяется
 * заново, согласие обязательно (literal(true)), дату согласия и User-Agent
 * ставит сервер. Сверх того:
 *  • товар должен существовать и быть на витрине — id приходит с клиента;
 *  • повтор той же заявки не создаёт вторую запись;
 *  • вошедшему покупателю согласие дополнительно фиксируется в журнале
 *    user-consents — там же, где согласия, данные при регистрации.
 */
export async function submitProductRequestAction(
	input: unknown,
): Promise<ProductRequestActionResult> {
	const parsed = productRequestSchema.safeParse(input);
	if (!parsed.success) {
		return {
			success: false,
			error: "Проверьте заполнение полей",
			code: "validation",
		};
	}

	const { ip, userAgent } = await getRequestMeta();

	const rl = await RATE_LIMITS.productRequest(ip);
	if (!rl.allowed) {
		return {
			success: false,
			error:
				"Мы уже получили несколько заявок с этого адреса. Попробуйте позже или позвоните.",
			code: "rate_limited",
		};
	}

	const { name, quantity } = parsed.data;
	const phone = normalizeRuPhone(parsed.data.phone);
	const comment = parsed.data.comment || undefined;
	const productId = Number(parsed.data.productId);

	try {
		const payload = await getPayloadInstance();

		let product: Product;
		try {
			product = (await payload.findByID({
				collection: "products",
				id: productId,
				depth: 1,
			})) as Product;
		} catch {
			return notFound();
		}
		// Черновик и скрытый товар на витрине не показаны — заявка на них
		// возможна только подделанным запросом.
		if (product._status === "draft" || product.inventory?.isVisible === false) {
			return notFound();
		}

		if (await isDuplicate(payload, productId, phone)) {
			return { success: true };
		}

		const user = await getCurrentUser();
		const consentAcceptedAt = new Date();

		const created = await createContactRequest({
			topic: "product",
			name,
			phone,
			message: comment,
			product: productId,
			quantity,
			user: user ? Number(user.id) : undefined,
			consentAcceptedAt,
			consentDocument: PERSONAL_DATA_CONSENT_SLUG,
			userAgent,
		});

		if (user) {
			await recordUserConsent(payload, Number(user.id), {
				acceptedAt: consentAcceptedAt,
				ip,
				userAgent,
			});
		}

		// Не бросает: заявка уже сохранена, сбой почты не должен превращаться
		// в ошибку для покупателя — иначе он отправит её второй раз.
		await notifyNewContactRequest(
			{
				id: created.id,
				topic: "product",
				name,
				phone,
				message: comment,
				product: {
					title: product.title,
					url: getProductHrefFromDoc(product),
					quantity,
				},
				consentAcceptedAt,
				consentDocument: PERSONAL_DATA_CONSENT_SLUG,
			},
			payload,
		);

		return { success: true };
	} catch (error) {
		const errorId = captureError(error, {
			source: "action",
			module: "contact/submit-product-request",
		});
		console.error("[product-request] create failed", error, { errorId });
		return {
			success: false,
			error: "Не удалось отправить заявку. Попробуйте ещё раз или позвоните.",
			code: "server_error",
		};
	}
}

function notFound(): ProductRequestActionResult {
	return {
		success: false,
		error: "Товар не найден — обновите страницу",
		code: "not_found",
	};
}

async function isDuplicate(
	payload: Payload,
	productId: number,
	phone: string,
): Promise<boolean> {
	const since = new Date(Date.now() - DUPLICATE_WINDOW_MS).toISOString();
	const { totalDocs } = await payload.count({
		collection: "contact-requests",
		where: {
			and: [
				{ topic: { equals: "product" } },
				{ product: { equals: productId } },
				{ phone: { equals: phone } },
				{ createdAt: { greater_than: since } },
			],
		},
		overrideAccess: true,
	});
	return totalDocs > 0;
}

/**
 * Фиксирует согласие на обработку ПДн в журнале user-consents — с версией
 * документа, как при регистрации (см. register.ts).
 *
 * Запись создаётся, только если этой версии документа пользователь ещё не
 * принимал: журнал отвечает на вопрос «с какой редакцией и когда согласился
 * впервые», и сотня одинаковых строк от сотни заявок ему не нужна. Сам факт
 * согласия на КОНКРЕТНУЮ заявку хранится в ней (consentAcceptedAt).
 *
 * Сбой здесь не отменяет заявку: согласие по ней уже записано в самой
 * заявке, а журнал — дополнительная связь с аккаунтом.
 */
async function recordUserConsent(
	payload: Payload,
	userId: number,
	meta: { acceptedAt: Date; ip: string; userAgent: string },
): Promise<void> {
	try {
		const { docs } = await payload.find({
			collection: "consents",
			where: {
				and: [
					{ slug: { equals: PERSONAL_DATA_CONSENT_SLUG } },
					{ isActive: { equals: true } },
				],
			},
			limit: 1,
			depth: 0,
			overrideAccess: true,
		});
		const consent = docs[0];
		if (!consent) {
			console.warn(
				`[product-request] документ согласия «${PERSONAL_DATA_CONSENT_SLUG}» не найден — журнал не пополнен`,
			);
			return;
		}
		const version = String(consent.version ?? "");

		const { totalDocs } = await payload.count({
			collection: "user-consents",
			where: {
				and: [
					{ user: { equals: userId } },
					{ consentSlug: { equals: PERSONAL_DATA_CONSENT_SLUG } },
					{ version: { equals: version } },
				],
			},
			overrideAccess: true,
		});
		if (totalDocs > 0) return;

		await payload.create({
			collection: "user-consents",
			data: {
				user: userId,
				consent: consent.id,
				consentSlug: PERSONAL_DATA_CONSENT_SLUG,
				version,
				acceptedAt: meta.acceptedAt.toISOString(),
				ip: meta.ip,
				userAgent: meta.userAgent,
			},
			overrideAccess: true,
		});
	} catch (error) {
		const errorId = captureError(error, {
			source: "action",
			module: "contact/record-consent",
		});
		console.error("[product-request] could not record user consent", error, {
			errorId,
		});
	}
}
