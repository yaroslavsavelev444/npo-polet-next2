import { z } from "zod";
import type {
	CheckoutCompanyInput,
	CheckoutContactsFormValue,
	CheckoutDeliveryInput,
	CheckoutPaymentMethod,
	CheckoutView,
} from "../types";
import { normalizeAddress } from "./address";
import {
	getDefaultPaymentMethod,
	isPaymentMethodCompatible,
} from "./payment-compatibility";
import { formatRuPhoneInput } from "./phone";

// Черновик принимает незаполненные поля и номера до нормализации.
const optionalText = z.string().optional();
const draftSchema = z.object({
	contacts: z.object({
		customerPhone: z.string(),
		fullName: z.string(),
		email: z.string(),
		recipientPhone: z.string(),
		hasSeparateRecipient: z.boolean(),
		callPreference: z.enum(["customer", "recipient"]),
		saveRecipient: z.boolean(),
	}),
	delivery: z.object({
		method: z.enum(["self_pickup", "pickup_point", "door_to_door"]),
		address: z
			.record(z.string(), z.unknown())
			.optional()
			.transform(normalizeAddress),
		transportCompanyId: optionalText,
		pickupPointId: optionalText,
		notes: optionalText,
		saveAddress: z.boolean(),
		includeShippingInInvoice: z.boolean().default(false),
	}),
	company: z.object({
		isCompany: z.boolean(),
		existingCompanyId: optionalText,
		companyName: optionalText,
		legalAddress: optionalText,
		companyAddress: optionalText,
		taxNumber: optionalText,
		kpp: optionalText,
		ogrn: optionalText,
		contactPerson: optionalText,
		saveCompany: z.boolean(),
	}),
	paymentMethod: z.enum(["invoice", "self_pickup_card", "self_pickup_cash"]),
	notes: z.string(),
	addressManualMode: z.boolean(),
});

export interface CheckoutDraft {
	contacts: CheckoutContactsFormValue;
	delivery: CheckoutDeliveryInput;
	company: CheckoutCompanyInput;
	paymentMethod: CheckoutPaymentMethod;
	notes: string;
	addressManualMode: boolean;
}

export function getCheckoutDefaults(
	view: CheckoutView,
	email: string,
): CheckoutDraft {
	const { savedRecipient, savedDelivery } = view;
	// В старых предпочтениях единственный номер мог принадлежать получателю.
	const customerPhone = savedRecipient?.customerPhone ?? "";
	const recipientPhone = customerPhone
		? (savedRecipient?.recipientPhone ?? "")
		: "";
	const method = savedDelivery?.method ?? "self_pickup";

	return {
		contacts: {
			fullName: savedRecipient?.fullName ?? "",
			email: savedRecipient?.email ?? email ?? "",
			customerPhone: formatRuPhoneInput(customerPhone),
			recipientPhone: formatRuPhoneInput(recipientPhone),
			hasSeparateRecipient: recipientPhone !== "",
			callPreference: "customer",
			saveRecipient: Boolean(savedRecipient),
		},
		delivery: {
			method,
			address: normalizeAddress(savedDelivery?.address),
			transportCompanyId: savedDelivery?.transportCompanyId,
			pickupPointId: savedDelivery?.pickupPointId,
			notes: "",
			saveAddress: Boolean(savedDelivery),
			includeShippingInInvoice: false,
		},
		company: { isCompany: false, saveCompany: false },
		paymentMethod: getDefaultPaymentMethod(method),
		notes: "",
		addressManualMode: !view.addressSuggestionsEnabled,
	};
}

function storageKey(userId: string) {
	return `checkout:draft:v1:${userId}`;
}

export function readCheckoutDraft(
	userId: string,
	view: CheckoutView,
): CheckoutDraft | null {
	try {
		const stored = window.sessionStorage.getItem(storageKey(userId));
		if (!stored) return null;
		const parsed = draftSchema.safeParse(JSON.parse(stored));
		if (!parsed.success) return null;

		const draft = parsed.data;
		const { delivery, company } = draft;
		if (!view.pickupPoints.some(({ id }) => id === delivery.pickupPointId)) {
			delivery.pickupPointId = undefined;
		}
		if (
			!view.transportCompanies.some(
				({ id }) => id === delivery.transportCompanyId,
			)
		) {
			delivery.transportCompanyId = undefined;
		}
		if (
			!view.companies.some(({ id }) => String(id) === company.existingCompanyId)
		) {
			company.existingCompanyId = undefined;
		}
		if (!isPaymentMethodCompatible(delivery.method, draft.paymentMethod)) {
			draft.paymentMethod = getDefaultPaymentMethod(delivery.method);
		}
		draft.addressManualMode ||= !view.addressSuggestionsEnabled;
		return draft;
	} catch {
		return null;
	}
}

export function writeCheckoutDraft(
	userId: string,
	draft: CheckoutDraft | null,
) {
	try {
		const key = storageKey(userId);
		if (draft) window.sessionStorage.setItem(key, JSON.stringify(draft));
		else window.sessionStorage.removeItem(key);
	} catch {
		// При недоступном sessionStorage форма продолжает работать в памяти.
	}
}
