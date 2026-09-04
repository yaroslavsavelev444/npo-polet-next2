import type { CheckoutAddress } from "@/modules/checkout/lib/address";
import type { CheckoutPreference } from "../../../payload-types";
import { getPayloadInstance } from "./getPayload";

export async function getCheckoutPreferences(
	userId: string,
): Promise<CheckoutPreference | null> {
	const payload = await getPayloadInstance();
	const { docs } = await payload.find({
		collection: "checkout-preferences",
		where: { user: { equals: userId } },
		limit: 1,
		depth: 1,
		overrideAccess: true,
	});
	return (docs[0] as unknown as CheckoutPreference) ?? null;
}

interface SaveCheckoutPreferencesInput {
	recipient?: { fullName: string; phone: string; email: string };
	delivery?: {
		method: string;
		/**
		 * Адрес сохраняется целиком, включая справочные идентификаторы: при
		 * следующем оформлении он подставляется в форму как уже выбранный, и без
		 * fiasId/индекса пользователю пришлось бы выбирать адрес заново.
		 */
		address?: Partial<CheckoutAddress>;
		transportCompanyId?: string;
		pickupPointId?: string;
	};
}

/**
 * Пустые строки формы → undefined, чтобы в базе оставался NULL: сохранённый
 * адрес читается тем же кодом, что и адрес заказа, и различие «"" против
 * NULL» между ними приводило бы к разному поведению автозаполнения.
 */
function toStoredAddress(address: Partial<CheckoutAddress> | undefined) {
	if (!address) return undefined;
	const entries = Object.entries(address).map(([key, raw]) => {
		const trimmed = typeof raw === "string" ? raw.trim() : "";
		return [key, trimmed === "" ? undefined : trimmed] as const;
	});
	return Object.fromEntries(entries);
}

export async function saveCheckoutPreferences(
	userId: string,
	input: SaveCheckoutPreferencesInput,
): Promise<void> {
	const payload = await getPayloadInstance();
	const existing = await getCheckoutPreferences(userId);

	const data: Record<string, unknown> = {};
	if (input.recipient) data.recipient = input.recipient;
	if (input.delivery) {
		data.delivery = {
			method: input.delivery.method,
			address: toStoredAddress(input.delivery.address),
			transportCompany: input.delivery.transportCompanyId
				? Number(input.delivery.transportCompanyId)
				: undefined,
			pickupPoint: input.delivery.pickupPointId
				? Number(input.delivery.pickupPointId)
				: undefined,
		};
	}

	if (existing) {
		await payload.update({
			collection: "checkout-preferences",
			id: existing.id,
			data,
			overrideAccess: true,
		});
		return;
	}

	await payload.create({
		collection: "checkout-preferences",
		data: { user: Number(userId), ...data },
		overrideAccess: true,
	});
}
