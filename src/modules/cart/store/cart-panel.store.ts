// src/modules/cart/store/cart-panel.store.ts
import { create } from "zustand";
import type { ProductCardData } from "@/modules/productCard";
import { useCartStore } from "@/shared/store/cart.store";
import { useCartItemsStore } from "@/shared/store/cartItems.store";
import {
	addToCartAction,
	clearCartAction,
	getCartViewAction,
	getGuestCartViewAction,
	markCartOnboardingSeenAction,
	mergeGuestCartAction,
	removeFromCartAction,
	updateCartItemQuantityAction,
} from "../actions/cart.actions";
import {
	hasSeenCartOnboarding,
	rememberCartOnboardingSeen,
} from "../lib/cart-onboarding";
import {
	addEntry,
	clearGuestCart,
	readGuestCart,
	removeEntry,
	setEntryQuantity,
	writeGuestCart,
} from "../lib/guest-cart-storage";
import type { CartEntry, CartView } from "../types";

/* ==========================================================================
   Зачем этот стор
   ==========================================================================
   До него состояние корзины было размазано: счётчик в шапке (cart.store),
   множество id для карточек товара (cartItems.store) и полная корзина в
   локальном состоянии страницы /cart. Панель, открываемая с любой страницы,
   такую схему ломает: она обязана знать полный состав корзины и оставаться
   согласованной со счётчиком, карточками каталога и страницей корзины
   одновременно.

   Поэтому здесь один владелец данных, а два прежних стора он ОБНОВЛЯЕТ
   производными значениями. Они не удалены сознательно: на них держатся шапка,
   мобильное меню и кнопка «В корзине» в каталоге, и переписывать их ради этой
   задачи значило бы менять половину витрины. Правило простое: пишет в них
   только syncDerivedStores ниже.
   ========================================================================== */

export type CartStatus = "idle" | "loading" | "ready" | "error";
export type CartItemOperation = "updating" | "removing";
export type CartOpenSource = "user" | "onboarding" | "restore";

interface CartPanelState {
	/* — сессия ————————————————————————————————————— */
	userId: string | null;
	isAuthenticated: boolean;
	/** Гость пользуется корзиной локально; слияние произойдёт после входа. */
	isGuest: boolean;

	/* — панель ————————————————————————————————————— */
	isOpen: boolean;
	openSource: CartOpenSource | null;

	/* — данные ————————————————————————————————————— */
	view: CartView | null;
	status: CartStatus;
	error: string | null;
	/** Идёт запись: итог показан по прошлым данным и вот-вот обновится. */
	isMutating: boolean;
	pending: Record<string, CartItemOperation>;

	/* — первое знакомство ——————————————————————————— */
	onboardingSeen: boolean;
	isOnboardingVisible: boolean;

	/* — действия ——————————————————————————————————— */
	init: (input: {
		userId: string | null;
		onboardingSeen: boolean;
		initialView?: CartView | null;
	}) => void;
	open: (source?: CartOpenSource) => void;
	close: () => void;
	refresh: (options?: { silent?: boolean }) => Promise<void>;
	add: (product: ProductCardData, quantity: number) => Promise<CartAddOutcome>;
	setQuantity: (productId: string, quantity: number) => Promise<void>;
	remove: (productId: string) => Promise<{ ok: boolean; message?: string }>;
	clear: () => Promise<void>;
	dismissOnboarding: () => void;
	syncGuestFromStorage: () => void;
}

export type CartAddOutcome =
	| { ok: true; opened: boolean }
	| {
			ok: false;
			reason: "auth" | "unavailable" | "limit" | "network";
			message: string;
	  };

/* ==========================================================================
   Очередь записей
   ==========================================================================
   Все обращения к серверу, меняющие корзину, идут строго друг за другом.
   Без этого два быстрых нажатия «+» уходят параллельно, отвечают в
   произвольном порядке, и в панели остаётся результат того, который вернулся
   последним, — а не того, который пользователь сделал последним.

   Очередь — модульная переменная, а не поле стора: она про транспорт, а не
   про состояние, и перерисовывать из-за неё нечего.
   ========================================================================== */
let mutationChain: Promise<unknown> = Promise.resolve();

function enqueue<T>(task: () => Promise<T>): Promise<T> {
	const run = mutationChain.then(task, task);
	// Ошибка одной операции не должна рвать очередь для следующих.
	mutationChain = run.catch(() => undefined);
	return run;
}

/* ==========================================================================
   Производные сторы
   ========================================================================== */

function syncDerivedStores(view: CartView | null): void {
	if (!view) return;
	useCartStore.getState().setItemCount(view.summary.totalItems);
	useCartItemsStore
		.getState()
		.hydrate(view.items.map((item) => item.product.id));
	// hydrate срабатывает только один раз (по флагу hydrated), поэтому состав
	// после первой загрузки задаётся точечно — множеством именно тех товаров,
	// которые сейчас в корзине.
	const current = useCartItemsStore.getState().productIds;
	const next = new Set(view.items.map((item) => item.product.id));
	for (const id of current)
		if (!next.has(id)) useCartItemsStore.getState().remove(id);
	for (const id of next)
		if (!current.has(id)) useCartItemsStore.getState().add(id);
}

/* ==========================================================================
   Оптимистичный пересчёт
   ==========================================================================
   Позиции пересчитываются на месте по тем же формулам, что и на сервере, —
   цена строки обязана меняться в тот же кадр, что и количество. Скидка
   КОРЗИНЫ при этом не трогается: её пороги знает только сервер, и выдумывать
   их на клиенте значило бы иногда показывать скидку, которой нет. Пока
   ответ не пришёл, итог помечен как пересчитываемый (isMutating).
   ========================================================================== */

function roundMoney(value: number): number {
	return Math.round(value * 100) / 100;
}

function recomputeView(view: CartView, items: CartView["items"]): CartView {
	let priceWithoutDiscount = 0;
	let priceAfterProductDiscounts = 0;
	let totalQuantity = 0;

	for (const item of items) {
		priceWithoutDiscount = roundMoney(
			priceWithoutDiscount + item.subtotalWithoutDiscount,
		);
		priceAfterProductDiscounts = roundMoney(
			priceAfterProductDiscounts + item.subtotal,
		);
		totalQuantity += item.quantity;
	}

	// Скидка корзины удерживается только пока в корзине хоть что-то есть:
	// пустая корзина со «скидкой 10%» — заведомо неверное состояние.
	const centralDiscountAmount =
		items.length === 0 ? 0 : view.summary.centralDiscountAmount;
	const productDiscountAmount = roundMoney(
		priceWithoutDiscount - priceAfterProductDiscounts,
	);

	return {
		...view,
		items,
		summary: {
			...view.summary,
			totalItems: totalQuantity,
			itemsCount: items.length,
			priceWithoutDiscount,
			productDiscountAmount,
			centralDiscountAmount,
			totalDiscount: roundMoney(productDiscountAmount + centralDiscountAmount),
			totalPrice: roundMoney(
				Math.max(priceAfterProductDiscounts - centralDiscountAmount, 0),
			),
		},
		validation: {
			isValid: items.every(
				(item) =>
					!item.product.minOrderQuantity ||
					item.quantity >= item.product.minOrderQuantity,
			),
			issues: items
				.filter(
					(item) =>
						item.product.minOrderQuantity &&
						item.quantity < item.product.minOrderQuantity,
				)
				.map((item) => ({
					productId: item.product.id,
					productTitle: item.product.title,
					currentQuantity: item.quantity,
					minOrderQuantity: item.product.minOrderQuantity,
					message: `Минимальная партия — ${item.product.minOrderQuantity} шт.`,
				})),
		},
	};
}

function withQuantity(
	view: CartView,
	productId: string,
	quantity: number,
): CartView {
	const items = view.items.map((item) => {
		if (item.product.id !== productId) return item;
		return {
			...item,
			quantity,
			subtotal: roundMoney(item.unitFinalPrice * quantity),
			subtotalWithoutDiscount: roundMoney(item.unitPrice * quantity),
			itemDiscount: roundMoney(
				(item.unitPrice - item.unitFinalPrice) * quantity,
			),
		};
	});
	return recomputeView(view, items);
}

/**
 * Длительность ухода строки. Держим в JS и CSS синхронно: раньше уберём
 * строку из данных — анимация оборвётся, позже — список будет держать
 * невидимую пустоту.
 */
const REMOVE_ANIMATION_MS = 260;

function settleAnimation(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, REMOVE_ANIMATION_MS));
}

const NETWORK_MESSAGE =
	"Не удалось связаться с сервером. Проверьте соединение и попробуйте ещё раз.";

/* ==========================================================================
   Стор
   ========================================================================== */

export const useCartPanel = create<CartPanelState>((set, get) => ({
	userId: null,
	isAuthenticated: false,
	isGuest: true,

	isOpen: false,
	openSource: null,

	view: null,
	status: "idle",
	error: null,
	isMutating: false,
	pending: {},

	onboardingSeen: true,
	isOnboardingVisible: false,

	init: ({ userId, onboardingSeen, initialView }) => {
		const previousUserId = get().userId;
		const isAuthenticated = Boolean(userId);

		// Смена аккаунта (вход, выход, вход под другим пользователем) обязана
		// сбросить данные: показать чужую корзину хуже, чем показать пустую.
		const identityChanged = previousUserId !== userId;
		// Выход и вход под другим аккаунтом снимают защиту от повторного слияния:
		// новая сессия имеет право перенести свою гостевую корзину.
		if (identityChanged) {
			resetGuestMergeGuard();
			// Производные сторы обязаны обнулиться ВМЕСТЕ с корзиной. Они живут
			// дольше этого стора и наполняются один раз (hydrate срабатывает
			// только при первом вызове), поэтому сами о смене аккаунта не узнают:
			// после выхода в шапке остался бы счётчик прошлого пользователя, а на
			// карточках каталога — его же отметки «в корзине». Настоящий состав
			// вернёт первый же успешный расчёт (см. syncDerivedStores).
			useCartStore.getState().setItemCount(0);
			useCartItemsStore.getState().clear();
		}

		const seen =
			onboardingSeen || (userId ? hasSeenCartOnboarding(userId) : true);

		set({
			userId,
			isAuthenticated,
			isGuest: !isAuthenticated,
			onboardingSeen: seen,
			isOnboardingVisible: identityChanged ? false : get().isOnboardingVisible,
			...(identityChanged
				? {
						view: initialView ?? null,
						status: initialView
							? ("ready" as CartStatus)
							: ("idle" as CartStatus),
						error: null,
						pending: {},
					}
				: initialView
					? { view: initialView, status: "ready" as CartStatus, error: null }
					: {}),
		});

		if (initialView) syncDerivedStores(initialView);
	},

	open: (source = "user") => {
		set({ isOpen: true, openSource: source });
		// Данные подтягиваются при каждом открытии: между двумя открытиями цена
		// могла измениться, а товар — уйти с продажи. Уже показанный состав при
		// этом остаётся на экране (silent), поэтому обновление не мигает.
		void get().refresh({ silent: Boolean(get().view) });
	},

	close: () =>
		set({ isOpen: false, openSource: null, isOnboardingVisible: false }),

	refresh: async ({ silent = false } = {}) => {
		if (!silent) set({ status: "loading", error: null });

		try {
			// Через ту же очередь, что и записи: иначе обновление, запущенное при
			// открытии панели, может обогнать ещё не доехавшую правку количества и
			// вернуть на экран прежнее число.
			const result = await enqueue(() =>
				get().isGuest
					? getGuestCartViewAction(readGuestCart())
					: getCartViewAction(),
			);

			if (!result.success) {
				set({ status: "error", error: result.message });
				return;
			}

			set({ view: result.data, status: "ready", error: null });
			syncDerivedStores(result.data);
		} catch {
			// Уже показанные данные не стираем: устаревший состав полезнее пустого
			// экрана, а строка ошибки объясняет, почему он мог отстать.
			set({ status: "error", error: NETWORK_MESSAGE });
		}
	},

	add: async (product, quantity) => {
		const { isGuest, userId, onboardingSeen } = get();

		/* — гость: пишем локально, цены считает сервер ——————————— */
		if (isGuest) {
			set({ isMutating: true });
			try {
				// Чтение и запись хранилища — ВНУТРИ очереди. Снаружи два быстрых
				// нажатия «в корзину» прочитали бы один и тот же список и второе
				// затёрло бы первое: количество выросло бы на один, а не на два.
				const result = await enqueue(() => {
					const next = addEntry(readGuestCart(), product.id, quantity);
					writeGuestCart(next);
					return getGuestCartViewAction(next);
				});
				if (result.success) {
					set({ view: result.data, status: "ready", error: null });
					syncDerivedStores(result.data);
				}
			} catch {
				set({ error: NETWORK_MESSAGE });
			} finally {
				set({ isMutating: false });
			}
			return { ok: true, opened: false };
		}

		/* — вошедший пользователь ————————————————————————— */
		set({ isMutating: true });
		try {
			const result = await enqueue(() => addToCartAction(product.id, quantity));

			if (!result.success) {
				if (result.error === "AUTH_REQUIRED") {
					return { ok: false, reason: "auth", message: result.message };
				}
				if (result.error === "MAX_QUANTITY_EXCEEDED") {
					return { ok: false, reason: "limit", message: result.message };
				}
				return { ok: false, reason: "unavailable", message: result.message };
			}

			set({ view: result.data, status: "ready", error: null });
			syncDerivedStores(result.data);

			// Первое в жизни аккаунта успешное добавление открывает панель само и
			// приводит с собой объяснение. Дальше — только по нажатию на иконку.
			if (!onboardingSeen && userId) {
				set({
					isOpen: true,
					openSource: "onboarding",
					isOnboardingVisible: true,
				});
				return { ok: true, opened: true };
			}

			return { ok: true, opened: false };
		} catch {
			return { ok: false, reason: "network", message: NETWORK_MESSAGE };
		} finally {
			set({ isMutating: false });
		}
	},

	setQuantity: async (productId, quantity) => {
		const { view, isGuest } = get();
		if (!view) return;

		const item = view.items.find((entry) => entry.product.id === productId);
		if (!item || item.quantity === quantity) return;

		const previousView = view;
		set({
			view: withQuantity(view, productId, quantity),
			pending: { ...get().pending, [productId]: "updating" },
			isMutating: true,
			error: null,
		});

		try {
			const result = isGuest
				? await enqueue(() => {
						const next = setEntryQuantity(readGuestCart(), productId, quantity);
						writeGuestCart(next);
						return getGuestCartViewAction(next);
					})
				: await enqueue(() =>
						updateCartItemQuantityAction(productId, quantity),
					);

			if (!result.success) {
				// Откат: сервер отказал (например, превышен максимум), и показывать
				// количество, которого в корзине нет, нельзя.
				set({ view: previousView, error: result.message });
				return;
			}

			set({ view: result.data, status: "ready" });
			syncDerivedStores(result.data);
		} catch {
			set({ view: previousView, error: NETWORK_MESSAGE });
		} finally {
			const pending = { ...get().pending };
			delete pending[productId];
			set({ pending, isMutating: false });
		}
	},

	remove: async (productId) => {
		const { view, isGuest } = get();
		// Корзина может быть ещё не загружена: кнопку «убрать» несёт и карточка
		// товара в каталоге, а туда полный состав корзины не приезжает. Тогда
		// откатывать нечего — просто выполняем удаление и забираем новый состав.
		const previousView = view;
		// Позиция НЕ выбрасывается из данных сразу. Она остаётся в списке с
		// пометкой 'removing', и строка складывается по высоте (см. Cart.module.css);
		// из данных она уходит вместе с ответом сервера. Так соседние строки
		// доезжают на её место плавно, а не подпрыгивают.
		set({
			pending: { ...get().pending, [productId]: "removing" },
			isMutating: true,
			error: null,
		});

		try {
			// Анимация ухода идёт параллельно запросу: быстрый ответ не обрывает её
			// на середине, медленный — не заставляет ждать сверх необходимого.
			const [result] = await Promise.all([
				isGuest
					? enqueue(() => {
							const next = removeEntry(readGuestCart(), productId);
							writeGuestCart(next);
							return getGuestCartViewAction(next);
						})
					: enqueue(() => removeFromCartAction(productId)),
				settleAnimation(),
			]);

			if (!result.success) {
				set({ view: previousView, error: result.message });
				return { ok: false, message: result.message };
			}

			set({ view: result.data, status: "ready" });
			syncDerivedStores(result.data);
			return { ok: true };
		} catch {
			set({ view: previousView, error: NETWORK_MESSAGE });
			return { ok: false, message: NETWORK_MESSAGE };
		} finally {
			const pending = { ...get().pending };
			delete pending[productId];
			set({ pending, isMutating: false });
		}
	},

	clear: async () => {
		const { view, isGuest } = get();
		const previousView = view;
		if (view) set({ view: recomputeView(view, []) });
		set({ isMutating: true, error: null });

		try {
			const result = isGuest
				? await enqueue(() => {
						clearGuestCart();
						return getGuestCartViewAction([]);
					})
				: await enqueue(() => clearCartAction());

			if (!result.success) {
				set({ view: previousView, error: result.message });
				return;
			}
			set({ view: result.data, status: "ready" });
			syncDerivedStores(result.data);
		} catch {
			set({ view: previousView, error: NETWORK_MESSAGE });
		} finally {
			set({ isMutating: false });
		}
	},

	dismissOnboarding: () => {
		const { userId } = get();
		// Отметка ставится СРАЗУ и локально, не дожидаясь ответа сервера: даже
		// если запись в профиль не пройдёт, подсказка не должна вернуться на
		// следующей перезагрузке этой же вкладки.
		if (userId) rememberCartOnboardingSeen(userId);
		set({ isOnboardingVisible: false, onboardingSeen: true });

		// Источник истины — профиль: он переживает очистку браузера и переезд на
		// другое устройство. Ответ не ждём и ошибку не показываем — сбой записи
		// означает лишь то, что подсказка может появиться ещё раз на другом
		// устройстве, и сообщать об этом пользователю нечего.
		void markCartOnboardingSeenAction().catch(() => undefined);
	},

	syncGuestFromStorage: () => {
		if (!get().isGuest) return;
		void get().refresh({ silent: true });
	},
}));

/**
 * Переносит гостевую корзину в аккаунт. Вызывается один раз после входа (см.
 * CartProvider), поэтому защита от повторного запуска живёт здесь, а не в
 * компоненте: провайдер перемонтируется при навигации, а этот модуль — нет.
 *
 * Локальная корзина удаляется ТОЛЬКО после подтверждённого слияния. Сбой сети
 * оставляет её нетронутой, и следующая же попытка (перезагрузка, переход)
 * повторит перенос — потерять товары нельзя.
 */
let mergeInFlight: Promise<void> | null = null;
let mergedForUser: string | null = null;

export async function mergeGuestCartIntoAccount(userId: string): Promise<{
	merged: boolean;
	skipped: { title: string | null }[];
}> {
	if (mergedForUser === userId) return { merged: false, skipped: [] };

	const entries: CartEntry[] = readGuestCart();
	if (entries.length === 0) {
		mergedForUser = userId;
		return { merged: false, skipped: [] };
	}

	if (mergeInFlight) {
		await mergeInFlight;
		return { merged: false, skipped: [] };
	}

	let outcome: { merged: boolean; skipped: { title: string | null }[] } = {
		merged: false,
		skipped: [],
	};

	mergeInFlight = (async () => {
		try {
			const result = await enqueue(() => mergeGuestCartAction(entries));
			if (!result.success) return;

			clearGuestCart();
			mergedForUser = userId;
			useCartPanel.setState({
				view: result.data,
				status: "ready",
				error: null,
			});
			syncDerivedStores(result.data);
			outcome = { merged: true, skipped: result.skipped };
		} catch {
			/* сеть подвела — локальная корзина цела, повторим при следующем заходе */
		} finally {
			mergeInFlight = null;
		}
	})();

	await mergeInFlight;
	return outcome;
}

/** Выход из аккаунта снимает защиту: следующий вход снова имеет право слить. */
export function resetGuestMergeGuard(): void {
	mergedForUser = null;
}
