// src/modules/cart/lib/guest-cart-storage.ts
import type { CartEntry } from "../types";

/**
 * Гостевая корзина в localStorage.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ЧТО ЗДЕСЬ ХРАНИТСЯ, А ЧТО НЕТ
 * ────────────────────────────────────────────────────────────────────────────
 * Только состав: id товара, количество и время добавления. Ни цен, ни сумм,
 * ни названий. Цены считает сервер при каждом расчёте (getGuestCartViewAction),
 * поэтому подделать итог правкой localStorage невозможно, а изменение цены или
 * снятие товара с продажи видны гостю сразу же, без всякой инвалидации.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ВЕРСИЯ В КЛЮЧЕ
 * ────────────────────────────────────────────────────────────────────────────
 * Ключ содержит версию формата. Меняется формат — меняется ключ, и старая
 * запись просто перестаёт читаться, вместо того чтобы разбираться в чужой
 * схеме. Мусор в localStorage чистить не нужно: браузер сам вытеснит его,
 * а объём записи — сотни байт.
 */

const STORAGE_KEY = "polet:cart:guest:v1";

/** Тот же предел, что и на сервере (MAX_GUEST_ENTRIES в cart.actions.ts). */
const MAX_ENTRIES = 50;

/** Тот же предел, что и на сервере (MAX_ITEM_QUANTITY в cart.actions.ts). */
const MAX_QUANTITY = 1000;

interface StoredCart {
	v: 1;
	items: CartEntry[];
	updatedAt: string;
}

/**
 * Любое обращение к localStorage обёрнуто в try/catch, и это не перестраховка:
 * в приватном режиме Safari и при запрете на хранение сайта обращение бросает
 * исключение, а не возвращает null. Корзина гостя — удобство, и отказ хранилища
 * не должен ронять страницу: в этом случае она просто работает как сессия без
 * памяти.
 */
function readRaw(): string | null {
	try {
		return window.localStorage.getItem(STORAGE_KEY);
	} catch {
		return null;
	}
}

function writeRaw(value: string | null): void {
	try {
		if (value === null) window.localStorage.removeItem(STORAGE_KEY);
		else window.localStorage.setItem(STORAGE_KEY, value);
	} catch {
		/* хранилище недоступно — работаем без него */
	}
}

function sanitizeEntry(value: unknown): CartEntry | null {
	if (!value || typeof value !== "object") return null;
	const raw = value as Record<string, unknown>;

	const productId = String(raw.productId ?? "");
	const numericId = Number(productId);
	if (!Number.isSafeInteger(numericId) || numericId <= 0) return null;

	const quantity = Number(raw.quantity);
	if (!Number.isSafeInteger(quantity) || quantity < 1) return null;

	const addedAt = typeof raw.addedAt === "string" ? raw.addedAt : null;

	return {
		productId: String(numericId),
		quantity: Math.min(quantity, MAX_QUANTITY),
		addedAt,
	};
}

/** Читает корзину гостя. Битая или чужая запись читается как пустая корзина. */
export function readGuestCart(): CartEntry[] {
	if (typeof window === "undefined") return [];

	const raw = readRaw();
	if (!raw) return [];

	try {
		const parsed = JSON.parse(raw) as Partial<StoredCart>;
		if (parsed?.v !== 1 || !Array.isArray(parsed.items)) return [];

		const byProduct = new Map<string, CartEntry>();
		for (const item of parsed.items) {
			const entry = sanitizeEntry(item);
			if (!entry) continue;
			// Дубль одного товара в записи — признак гонки двух вкладок. Берём
			// большее количество, а не сумму: то же правило, что и при слиянии с
			// серверной корзиной (см. mergeGuestCartAction).
			const existing = byProduct.get(entry.productId);
			byProduct.set(
				entry.productId,
				existing
					? { ...entry, quantity: Math.max(existing.quantity, entry.quantity) }
					: entry,
			);
			if (byProduct.size >= MAX_ENTRIES) break;
		}
		return [...byProduct.values()];
	} catch {
		return [];
	}
}

/** Перезаписывает корзину гостя целиком. Пустой список удаляет запись. */
export function writeGuestCart(entries: CartEntry[]): void {
	if (typeof window === "undefined") return;

	if (entries.length === 0) {
		writeRaw(null);
		return;
	}

	const payload: StoredCart = {
		v: 1,
		items: entries.slice(0, MAX_ENTRIES),
		updatedAt: new Date().toISOString(),
	};
	writeRaw(JSON.stringify(payload));
}

export function clearGuestCart(): void {
	writeRaw(null);
}

/**
 * Уведомляет о правках корзины из ДРУГОЙ вкладки.
 *
 * Событие `storage` приходит только в чужие вкладки — своя о своей же записи
 * не узнаёт. Это ровно то, что нужно: собственные изменения панель применяет
 * сама и синхронно, а из чужих ей интересен только факт «состав изменился».
 */
export function subscribeToGuestCart(
	onChange: (entries: CartEntry[]) => void,
): () => void {
	if (typeof window === "undefined") return () => {};

	const handle = (event: StorageEvent) => {
		if (event.key !== null && event.key !== STORAGE_KEY) return;
		onChange(readGuestCart());
	};

	window.addEventListener("storage", handle);
	return () => window.removeEventListener("storage", handle);
}

/** Складывает добавление в уже имеющийся список — правило «+ к количеству». */
export function addEntry(
	entries: CartEntry[],
	productId: string,
	quantity: number,
): CartEntry[] {
	const index = entries.findIndex((entry) => entry.productId === productId);
	if (index === -1) {
		return [
			...entries,
			{
				productId,
				quantity: Math.min(quantity, MAX_QUANTITY),
				addedAt: new Date().toISOString(),
			},
		];
	}

	const next = [...entries];
	next[index] = {
		...next[index],
		quantity: Math.min(next[index].quantity + quantity, MAX_QUANTITY),
	};
	return next;
}

export function setEntryQuantity(
	entries: CartEntry[],
	productId: string,
	quantity: number,
): CartEntry[] {
	if (quantity < 1)
		return entries.filter((entry) => entry.productId !== productId);
	return entries.map((entry) =>
		entry.productId === productId
			? { ...entry, quantity: Math.min(quantity, MAX_QUANTITY) }
			: entry,
	);
}

export function removeEntry(
	entries: CartEntry[],
	productId: string,
): CartEntry[] {
	return entries.filter((entry) => entry.productId !== productId);
}
