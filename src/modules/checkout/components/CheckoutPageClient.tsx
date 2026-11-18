"use client";

import {
	AlertTriangle,
	ArrowLeft,
	PackageSearch,
	ShoppingBag,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
	useTransition,
} from "react";
import { trackPurchase } from "@/modules/analytics/ecommerce";
import { openAuthOverlay } from "@/modules/auth/store/auth-overlay.store";
import { useCartPanel } from "@/modules/cart/store/cart-panel.store";
import { markOrderJustCreated } from "@/modules/orders/lib/celebrate-order";
import type { PromoApplyPreview } from "@/modules/promo";
import { PromoCodeField } from "@/modules/promo";
import { PageContainer } from "@/shared/components/PageContainer";
import { appToast } from "@/shared/lib/toast";
import {
	resolveCheckoutAttemptAction,
	submitOrderAction,
} from "../actions/checkout.actions";
import { useCheckoutValidation } from "../hooks/useCheckoutValidation";
import {
	CHECKOUT_ATTEMPT_PARAM,
	getCheckoutCartKey,
} from "../lib/checkout-attempt";
import {
	type CheckoutDraft,
	getCheckoutDefaults,
	readCheckoutDraft,
	writeCheckoutDraft,
} from "../lib/checkout-draft";
import {
	buildErrorEntries,
	CHECKOUT_FIELDS,
	type CheckoutSectionKey,
	findFirstErrorTarget,
	summarizeAddressErrors,
} from "../lib/checkout-fields";
import { buildCheckoutTotals } from "../lib/checkout-totals";
import { focusCheckoutField } from "../lib/focus-field";
import {
	getAvailablePaymentMethods,
	getDefaultPaymentMethod,
	isPaymentMethodCompatible,
} from "../lib/payment-compatibility";
import { normalizeRuPhone } from "../lib/phone";
import type {
	CheckoutDeliveryInput,
	CheckoutReceipt,
	CheckoutSubmitInput,
	CheckoutView,
} from "../types";
import styles from "./Checkout.module.css";
import {
	CheckoutAttemptStatus,
	type CheckoutRecovery,
} from "./CheckoutAttemptStatus";
import { CheckoutDock } from "./CheckoutDock";
import { CheckoutHero } from "./CheckoutHero";
import { CheckoutSection, type CheckoutSectionState } from "./CheckoutSection";
import { CompanySection } from "./CompanySection";
import { ContactsSection } from "./ContactsSection";
import { DeliverySection } from "./DeliverySection";
import { TextareaField } from "./fields";
import { OrderItemsPanel } from "./OrderItemsPanel";
import { OrderSummaryPanel } from "./OrderSummaryPanel";
import { PaymentSection } from "./PaymentSection";

interface CheckoutPageClientProps {
	initialView: CheckoutView;
	pendingAttempt: string | null;
	user: { name: string; email: string };
	/** id покупателя — нужен стору корзины, чтобы отличить сессию от гостевой. */
	userId: string;
	/** Видел ли покупатель объяснение про корзину (отметка в профиле). */
	cartOnboardingSeen: boolean;
	/** Цепочка навигации, отрисованная на сервере. */
	breadcrumbs: ReactNode;
}

/**
 * Оформление заказа.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ОТКУДА БЕРУТСЯ ДАННЫЕ И КТО ЗДЕСЬ ИСТОЧНИК ПРАВДЫ
 * ════════════════════════════════════════════════════════════════════════════
 * Поля формы сохраняются в черновике текущего покупателя в этой вкладке.
 *
 * СОСТАВ ЗАКАЗА живёт в общем сторе корзины, а не в снимке с сервера. Разница
 * принципиальная: покупатель может изменить количество прямо здесь, поправить
 * корзину в соседней вкладке или увидеть, что товар сняли с продажи, — и во
 * всех трёх случаях на экране обязан оказаться актуальный состав, а не тот,
 * что приехал при открытии страницы. Серверный снимок используется ровно один
 * раз: им наполняется стор до первой отрисовки, чтобы не мигнуть пустой
 * корзиной.
 *
 * ДЕНЬГИ не считаются здесь вообще. Суммы без промокода приходят витриной
 * корзины, суммы с промокодом — с сервера тем же расчётом, который создаст
 * заказ (applyPromoCodeAction → calculateCheckoutPricing). Разложить готовый
 * итог на строки помогает `buildCheckoutTotals`, и он тоже ничего не считает.
 * Перед созданием заказа сервер пересчитывает всё заново и по своей корзине:
 * подделать цену, подменив тело запроса, невозможно — присланного числа там
 * просто нет.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ПОЧЕМУ КНОПКА НЕ БЛОКИРУЕТСЯ ПРИ НЕЗАПОЛНЕННОЙ ФОРМЕ
 * ════════════════════════════════════════════════════════════════════════════
 * Заблокированная кнопка не объясняет, чего не хватает. Нажатие обязано быть
 * возможным: оно показывает список проблем и уводит к первому полю. Двойное
 * нажатие при этом не создаёт второй заказ — синхронный барьер inFlightRef
 * закрывается до первого await (useTransition обновляет isSubmitting
 * асинхронно, и одного флага состояния было бы мало).
 */
export function CheckoutPageClient({
	initialView,
	pendingAttempt,
	user,
	userId,
	cartOnboardingSeen,
	breadcrumbs,
}: CheckoutPageClientProps) {
	const router = useRouter();
	const [isSubmitting, startSubmitting] = useTransition();

	// ── Корзина ─────────────────────────────────────────────────────────────
	const initCart = useCartPanel((state) => state.init);
	const storeView = useCartPanel((state) => state.view);
	const cartPending = useCartPanel((state) => state.pending);
	const isCartMutating = useCartPanel((state) => state.isMutating);
	const cartError = useCartPanel((state) => state.error);
	const setCartQuantity = useCartPanel((state) => state.setQuantity);
	const removeFromCart = useCartPanel((state) => state.remove);
	const refreshCart = useCartPanel((state) => state.refresh);

	// Серверные данные заезжают в стор синхронно, до первой отрисовки: иначе
	// на кадр показалась бы пустая корзина, а затем — настоящая.
	const seeded = useRef(false);
	if (!seeded.current) {
		seeded.current = true;
		initCart({
			userId,
			onboardingSeen: cartOnboardingSeen,
			initialView: initialView.cart,
		});
	}

	const cart = storeView ?? initialView.cart;

	// ── Состояние формы ─────────────────────────────────────────────────────
	const [draft, setDraft] = useState(() =>
		getCheckoutDefaults(initialView, user.email),
	);
	const draftRef = useRef(draft);
	const draftLoadedRef = useRef(false);
	const draftClosedRef = useRef(false);
	const [hasDraft, setHasDraft] = useState(false);
	const [draftStatus, setDraftStatus] = useState("");
	const [draftVersion, setDraftVersion] = useState(0);
	const {
		contacts,
		delivery,
		company,
		paymentMethod,
		notes,
		addressManualMode,
	} = draft;

	useLayoutEffect(() => {
		if (draftLoadedRef.current) return;
		draftLoadedRef.current = true;

		const restored = readCheckoutDraft(userId, initialView);
		if (restored) {
			draftRef.current = restored;
			setDraft(restored);
			setHasDraft(true);
			setDraftStatus("Черновик восстановлен");
			setDraftVersion((version) => version + 1);
		}
	}, [userId, initialView]);

	const updateDraft = useCallback(
		(changes: Partial<CheckoutDraft>) => {
			if (draftClosedRef.current) return;
			const next = { ...draftRef.current, ...changes };
			draftRef.current = next;
			setDraft(next);
			setHasDraft(true);
			setDraftStatus("");
			writeCheckoutDraft(userId, next);
		},
		[userId],
	);
	const handleAddressManualModeChange = useCallback(
		(manualMode: boolean) => updateDraft({ addressManualMode: manualMode }),
		[updateDraft],
	);

	/**
	 * Применённый промокод.
	 *
	 * Хранится ровно здесь и нигде больше — ни в корзине, ни в сессии. Наружу
	 * уходит один только код: сумму скидки сервер пересчитывает сам, поэтому
	 * состояние формы физически не может повлиять на цену заказа.
	 */
	const [promo, setPromo] = useState<PromoApplyPreview | null>(null);
	const [isPromoRevalidating, setIsPromoRevalidating] = useState(false);
	// Ошибка, не привязанная ни к какому полю: сеть, пустая корзина, отказ
	// бизнес-логики. Живёт отдельно от ошибок полей, потому что исправляется
	// не правкой формы, а повторной попыткой.
	const [formError, setFormError] = useState<string | null>(null);

	/**
	 * Полезная нагрузка ровно в том виде, в каком она уйдёт на сервер. Именно
	 * она валидируется на клиенте — иначе клиент проверял бы одни данные
	 * (телефон с маской), а сервер получал другие (E.164), и результаты
	 * расходились бы.
	 */
	const submitValue = useMemo<CheckoutSubmitInput>(
		() => ({
			customer: { phone: normalizeRuPhone(contacts.customerPhone) },
			recipient: {
				fullName: contacts.fullName,
				// Отдельный номер получателя существует только при включённом
				// переключателе: иначе получателем считается сам заказчик, и
				// второго номера у заказа нет.
				phone: contacts.hasSeparateRecipient
					? normalizeRuPhone(contacts.recipientPhone)
					: "",
				email: contacts.email,
				saveRecipient: contacts.saveRecipient,
			},
			contactPreference: contacts.callPreference,
			delivery,
			company: company.isCompany ? company : undefined,
			paymentMethod,
			notes,
			promoCode: promo?.code,
		}),
		[contacts, delivery, company, paymentMethod, notes, promo],
	);

	const validation = useCheckoutValidation(submitValue);
	const { visibleErrors, allErrors } = validation;

	const errorEntries = useMemo(
		() => buildErrorEntries(visibleErrors, { addressManualMode }),
		[visibleErrors, addressManualMode],
	);

	// В режиме подсказок адрес — одно поле, поэтому под ним показывается одно
	// сообщение вместо четырёх ошибок по компонентам.
	const addressSummaryError = useMemo(() => {
		if (addressManualMode) return undefined;
		const hasAddressError = Object.keys(visibleErrors).some((path) =>
			path.startsWith("delivery.address."),
		);
		return hasAddressError ? summarizeAddressErrors(visibleErrors) : undefined;
	}, [visibleErrors, addressManualMode]);

	const availablePaymentMethods = useMemo(
		() => getAvailablePaymentMethods(delivery.method),
		[delivery.method],
	);

	// ── Деньги ──────────────────────────────────────────────────────────────
	const totals = useMemo(() => buildCheckoutTotals(cart, promo), [cart, promo]);

	/**
	 * Отпечаток корзины для перепроверки промокода.
	 *
	 * В него входит и состав, и суммы: скидка по коду считается от корзины, и
	 * любое изменение любой из этих величин делает показанную скидку скидкой
	 * от корзины, которой больше нет.
	 */
	const cartKey = useMemo(() => getCheckoutCartKey(cart), [cart]);

	// Суммы пересчитываются — показанные относятся к прошлому состоянию, и
	// молчать об этом нельзя.
	const isStale = isCartMutating || isPromoRevalidating;

	// ── Состояние разделов ──────────────────────────────────────────────────
	//
	// Считается из тех же ошибок, что показываются у полей и в сводке:
	// отдельного «прогресса заполнения» здесь нет и быть не должно — он
	// неизбежно разошёлся бы с валидацией.
	const sectionStates = useMemo(() => {
		const count = (errors: Record<string, string>) => {
			const result: Partial<Record<CheckoutSectionKey, number>> = {};
			for (const path of Object.keys(errors)) {
				const section = CHECKOUT_FIELDS[path]?.section;
				if (!section) continue;
				result[section] = (result[section] ?? 0) + 1;
			}
			return result;
		};

		const all = count(allErrors);
		const visible = count(visibleErrors);

		const resolve = (section: CheckoutSectionKey): CheckoutSectionState => {
			if ((visible[section] ?? 0) > 0) return "error";
			return (all[section] ?? 0) > 0 ? "idle" : "done";
		};

		return {
			delivery: resolve("delivery"),
			contacts: resolve("contacts"),
			company: resolve("company"),
			payment: resolve("payment"),
		};
	}, [allErrors, visibleErrors]);

	// ── Действия с корзиной ─────────────────────────────────────────────────
	const handleQuantityChange = useCallback(
		(productId: string, quantity: number) => {
			setFormError(null);
			void setCartQuantity(productId, quantity);
		},
		[setCartQuantity],
	);

	const handleRemoveItem = useCallback(
		async (productId: string) => {
			setFormError(null);
			const result = await removeFromCart(productId);
			if (!result.ok && result.message) appToast.warning(result.message);
		},
		[removeFromCart],
	);

	const handleDeliveryChange = useCallback(
		(next: CheckoutDeliveryInput) => {
			const currentPayment = draftRef.current.paymentMethod;
			updateDraft({
				delivery: next,
				paymentMethod: isPaymentMethodCompatible(next.method, currentPayment)
					? currentPayment
					: getDefaultPaymentMethod(next.method),
			});
			setFormError(null);
		},
		[updateDraft],
	);

	function resetDraft() {
		const defaults = getCheckoutDefaults(initialView, user.email);
		draftRef.current = defaults;
		setDraft(defaults);
		setDraftVersion((version) => version + 1);
		setHasDraft(false);
		setDraftStatus("Черновик сброшен");
		setFormError(null);
		validation.reset();
		writeCheckoutDraft(userId, null);
	}

	const handlePromoChange = useCallback((next: PromoApplyPreview | null) => {
		setPromo(next);
		setFormError(null);
	}, []);

	// ── Отправка ────────────────────────────────────────────────────────────
	//
	// Повторные нажатия до завершения запроса создавали бы дубли заказов:
	// useTransition обновляет isSubmitting асинхронно, поэтому одного флага
	// состояния мало — нужен синхронный барьер.
	const inFlightRef = useRef(false);
	const attemptRef = useRef(pendingAttempt);
	const [recovery, setRecovery] = useState<CheckoutRecovery>(
		pendingAttempt ? { state: "checking" } : { state: "idle" },
	);
	const [summaryFocusToken, setSummaryFocusToken] = useState(0);
	const summaryRef = useRef<HTMLDivElement | null>(null);

	function revealErrors() {
		validation.revealAll();
		const entries = buildErrorEntries(allErrors, { addressManualMode });
		// Одна ошибка — вести пользователя списком из одного пункта незачем,
		// сразу ставим фокус в поле. Несколько — показываем сводку: она
		// объясняет объём работы лучше, чем прыжок в первое поле.
		if (entries.length === 1) {
			const target = findFirstErrorTarget(entries);
			if (target) focusCheckoutField(target);
			return;
		}
		setSummaryFocusToken((token) => token + 1);
	}

	const updateAttempt = useCallback((id: string | null) => {
		attemptRef.current = id;
		const url = new URL(window.location.href);
		if (id) url.searchParams.set(CHECKOUT_ATTEMPT_PARAM, id);
		else url.searchParams.delete(CHECKOUT_ATTEMPT_PARAM);
		window.history.replaceState(null, "", url);
	}, []);

	const finishCheckout = useCallback(
		(receipt: CheckoutReceipt) => {
			draftClosedRef.current = true;
			writeCheckoutDraft(userId, null);
			const { orderNumber, purchase } = receipt;
			const key = `checkout:seen:${orderNumber}`;
			let seen = false;
			try {
				seen = window.sessionStorage.getItem(key) !== null;
				window.sessionStorage.setItem(key, "1");
			} catch {
				// Метрика также объединяет события по номеру заказа.
			}
			if (!seen) {
				trackPurchase(purchase);
				appToast.success(`Заказ №${orderNumber} оформлен`);
				markOrderJustCreated(orderNumber);
			}
			setRecovery({ state: "complete", orderNumber });
			router.replace(`/orders/${encodeURIComponent(orderNumber)}`);
		},
		[router, userId],
	);

	const checkAttempt = useCallback(() => {
		const attempt = attemptRef.current;
		if (!attempt || inFlightRef.current) return;

		inFlightRef.current = true;
		setRecovery({ state: "checking" });
		startSubmitting(async () => {
			try {
				const result = await resolveCheckoutAttemptAction(attempt, userId);
				if (result.state === "created") {
					finishCheckout(result.receipt);
					return;
				}

				inFlightRef.current = false;
				if (result.state === "auth_required") {
					setRecovery({ state: "auth" });
					return;
				}

				updateAttempt(null);
				setRecovery(
					result.state === "removed"
						? { state: "removed", orderNumber: result.orderNumber }
						: { state: "closed" },
				);
				void refreshCart({ silent: true });
			} catch {
				inFlightRef.current = false;
				setRecovery({ state: "unknown" });
			}
		});
	}, [finishCheckout, refreshCart, updateAttempt, userId]);

	useEffect(() => {
		if (pendingAttempt) checkAttempt();
	}, [checkAttempt, pendingAttempt]);

	useEffect(() => {
		if (recovery.state !== "unknown") return;
		window.addEventListener("online", checkAttempt);
		return () => window.removeEventListener("online", checkAttempt);
	}, [checkAttempt, recovery.state]);

	function signInToCheckAttempt() {
		openAuthOverlay({
			reason: "Войдите в аккаунт, чтобы проверить, оформился ли заказ.",
			returnPath: window.location.pathname + window.location.search,
			onSuccess: (accountId) => {
				if (accountId === userId) checkAttempt();
			},
		});
	}

	function handleSubmit() {
		if (inFlightRef.current || isSubmitting || attemptRef.current || isStale)
			return;

		setRecovery({ state: "idle" });
		setFormError(null);

		if (!validation.isValid) {
			revealErrors();
			return;
		}

		const attemptId = crypto.randomUUID();
		updateAttempt(attemptId);
		inFlightRef.current = true;
		const submitted = submitValue;

		startSubmitting(async () => {
			try {
				const result = await submitOrderAction(submitted, {
					id: attemptId,
					userId,
					cartKey,
				});

				if (result.success) {
					finishCheckout(result.data);
					return;
				}

				updateAttempt(null);
				inFlightRef.current = false;

				if (result.error === "AUTH_REQUIRED") {
					// Сессия истекла, пока заполняли форму. Уводить отсюда на
					// /auth/login нельзя ни в коем случае: вместе со страницей
					// пропала бы вся анкета — получатель, адрес, реквизиты
					// организации, — и человек заполнял бы её заново. Окно входа
					// встаёт поверх формы, форма остаётся нетронутой.
					//
					// Заказ после входа НЕ отправляется сам. Между истёкшей
					// сессией и повторным входом проходит время, за которое могли
					// измениться и состав корзины, и цены, и действие промокода;
					// подтвердить итог обязан покупатель, а не мы за него. Ровно
					// так же поступает ветка PROMO_INVALID ниже и по той же
					// причине.
					openAuthOverlay({
						reason:
							"Сессия истекла, пока вы заполняли форму. Войдите — данные заказа сохранены.",
						onSuccess: () => {
							appToast.success(
								"Вы снова в аккаунте. Проверьте итог и подтвердите заказ",
							);
						},
					});
					return;
				}

				if (
					result.error === "CART_EMPTY" ||
					result.error === "CART_INVALID" ||
					result.error === "CART_CHANGED" ||
					result.error === "CART_HAS_UNAVAILABLE"
				) {
					// Корзину изменили в другой вкладке или товар сняли с продажи,
					// пока заполнялась форма. Забираем актуальный состав в стор —
					// страница перерисуется по нему, и на экране окажется то, что
					// есть на самом деле, а не то, что приехало при открытии.
					setFormError(result.message);
					appToast.warning(result.message);
					void refreshCart({ silent: true });
					return;
				}

				if (result.error === "PROMO_INVALID") {
					// Промокод перестал действовать между «Применить» и
					// подтверждением. Он снимается — иначе следующая попытка
					// оформить заказ упиралась бы в тот же отказ, — но заказ при
					// этом НЕ отправляется автоматически: итог только что вырос,
					// и подтвердить новую сумму должен покупатель, а не мы за
					// него.
					setPromo(null);
					setFormError(result.message);
					appToast.warning(result.message);
					return;
				}

				if (result.fieldErrors && Object.keys(result.fieldErrors).length > 0) {
					validation.setServerErrors(result.fieldErrors, submitted);
					validation.revealAll();
					setSummaryFocusToken((token) => token + 1);
					return;
				}

				setFormError(result.message);
				appToast.warning(result.message);
			} catch (error) {
				console.error("[checkout] submit failed:", error);
				inFlightRef.current = false;
				checkAttempt();
			}
		});
	}

	const handleJumpToSummary = useCallback(() => {
		const node = summaryRef.current;
		if (!node) return;
		const prefersReducedMotion = window.matchMedia?.(
			"(prefers-reduced-motion: reduce)",
		).matches;
		node.scrollIntoView({
			behavior: prefersReducedMotion ? "auto" : "smooth",
			block: "end",
		});
	}, []);

	// Недоступная позиция идёт ПЕРЕД замечанием о количестве: пока она в
	// корзине, сервер заказ не примет вовсе (см. submitOrderAction), а
	// «доведите количество до минимальной партии» отправило бы покупателя
	// чинить не то. Оба препятствия показываются одной строкой рядом с
	// кнопкой, потому что оба решаются в составе заказа выше.
	const cartIssue =
		cart.unavailable.length > 0
			? cart.unavailable.length === 1
				? "Товар выше больше недоступен для заказа — уберите его, чтобы оформить заказ"
				: "Товары выше больше недоступны для заказа — уберите их, чтобы оформить заказ"
			: cart.validation.isValid
				? null
				: (cart.validation.issues[0]?.message ??
					"Проверьте количество товаров в корзине");

	const attemptStatus = (
		<CheckoutAttemptStatus
			recovery={recovery}
			onCheck={checkAttempt}
			onSignIn={signInToCheckAttempt}
		/>
	);
	const hasPendingAttempt =
		recovery.state === "checking" ||
		recovery.state === "unknown" ||
		recovery.state === "auth" ||
		recovery.state === "complete";

	// ── Тупиковое состояние: заказывать нечего ──────────────────────────────
	if (cart.items.length === 0) {
		return (
			<>
				<CheckoutHero
					breadcrumbs={breadcrumbs}
					positions={0}
					itemsQuantity={0}
					total={0}
					isStale={false}
				/>
				<PageContainer>
					<div className={styles.empty}>
						{hasPendingAttempt ? (
							attemptStatus
						) : (
							<>
								{attemptStatus}
								<PackageSearch
									size={28}
									strokeWidth={1.25}
									aria-hidden
									className="text-[var(--border-light)]"
								/>
								<p className={styles.emptyTitle}>Заказывать нечего</p>
								<p className={styles.emptyText}>
									В корзине не осталось товаров — оформлять пустой заказ не из
									чего. Загляните в каталог: всё, что вы выберете, вернётся
									сюда.
								</p>
								{/* Причина, по которой корзина опустела (например, её очистили в
						    другой вкладке уже после открытия формы), не должна пропасть
						    вместе с формой. */}
								{formError && (
									<p
										role="alert"
										className={`${styles.notice} ${styles.noticeWarn}`}
									>
										<AlertTriangle
											size={15}
											aria-hidden
											className={styles.noticeIcon}
										/>
										<span>{formError}</span>
									</p>
								)}
								<div className={styles.emptyActions}>
									<Link
										href="/category"
										className={`${styles.btn} ${styles.btnPrimary}`}
									>
										<ShoppingBag size={15} aria-hidden />
										Перейти в каталог
									</Link>
									<Link href="/cart" className={styles.btn}>
										<ArrowLeft size={15} aria-hidden />
										Вернуться в корзину
									</Link>
								</div>
							</>
						)}
					</div>
				</PageContainer>
			</>
		);
	}

	return (
		<>
			<CheckoutHero
				breadcrumbs={breadcrumbs}
				positions={totals.positions}
				itemsQuantity={totals.itemsQuantity}
				total={totals.total}
				isStale={isStale}
			/>

			<PageContainer>
				<div className={styles.layout}>
					<div className={styles.form}>
						<div
							className={styles.draftBar}
							data-visible={Boolean(draftStatus || hasDraft)}
						>
							<span role="status">{draftStatus}</span>
							{hasDraft && (
								<button
									type="button"
									className={styles.sectionLink}
									onClick={resetDraft}
									disabled={isSubmitting || hasPendingAttempt}
								>
									Сбросить черновик
								</button>
							)}
						</div>
						<CheckoutSection
							index={1}
							title="Состав заказа"
							hint="Количество можно поправить здесь — уходить в корзину не нужно"
							state={
								cart.validation.isValid && cart.unavailable.length === 0
									? "done"
									: "error"
							}
							action={
								<Link href="/cart" className={styles.sectionLink}>
									В корзину
								</Link>
							}
						>
							<OrderItemsPanel
								items={cart.items}
								unavailable={cart.unavailable}
								validation={cart.validation}
								pending={cartPending}
								onQuantityChange={handleQuantityChange}
								onRemove={handleRemoveItem}
							/>

							{cartError && (
								<p
									role="alert"
									className={`${styles.notice} ${styles.noticeError}`}
								>
									<span>{cartError}</span>
								</p>
							)}
						</CheckoutSection>

						<CheckoutSection
							index={2}
							title="Способ получения"
							hint="От него зависят и набор данных, и доступные способы оплаты"
							state={sectionStates.delivery}
						>
							<DeliverySection
								key={draftVersion}
								value={delivery}
								onChange={handleDeliveryChange}
								pickupPoints={initialView.pickupPoints}
								transportCompanies={initialView.transportCompanies}
								errors={visibleErrors}
								addressSummaryError={addressSummaryError}
								onFieldBlur={validation.markTouched}
								suggestionsEnabled={initialView.addressSuggestionsEnabled}
								addressManualMode={addressManualMode}
								onAddressManualModeChange={handleAddressManualModeChange}
							/>
						</CheckoutSection>

						<CheckoutSection
							index={3}
							title="Контактные данные"
							hint="Кто оформляет заказ, кто его получит и по какому номеру звонить"
							state={sectionStates.contacts}
						>
							<ContactsSection
								value={contacts}
								onChange={(next) => {
									updateDraft({ contacts: next });
									setFormError(null);
								}}
								errors={visibleErrors}
								onFieldBlur={validation.markTouched}
							/>
						</CheckoutSection>

						<CheckoutSection
							index={4}
							title="Плательщик"
							hint="Обычному заказу ничего заполнять не нужно"
							state={sectionStates.company}
						>
							<CompanySection
								key={draftVersion}
								value={company}
								onChange={(next) => updateDraft({ company: next })}
								companies={initialView.companies}
								errors={visibleErrors}
								onFieldBlur={validation.markTouched}
								// Один ключ DaData на адреса и организации: настроены
								// одни — настроены и другие.
								suggestionsEnabled={initialView.addressSuggestionsEnabled}
							/>
						</CheckoutSection>

						<CheckoutSection
							index={5}
							title="Оплата"
							hint="Деньги не списываются при оформлении"
							state={sectionStates.payment}
						>
							<PaymentSection
								value={paymentMethod}
								onChange={(next) => updateDraft({ paymentMethod: next })}
								available={availablePaymentMethods}
								error={visibleErrors.paymentMethod}
								total={totals.total}
								limitedByDelivery={availablePaymentMethods.length === 1}
							/>
						</CheckoutSection>

						<CheckoutSection
							index={6}
							title="Комментарий к заказу"
							hint="Всё, что важно знать менеджеру"
						>
							<TextareaField
								label="Комментарий"
								optionalNote={`${notes.length} / 1000`}
								rows={3}
								maxLength={1000}
								value={notes}
								onChange={(event) => updateDraft({ notes: event.target.value })}
								placeholder="Например: нужен счёт с НДС"
							/>
						</CheckoutSection>
					</div>

					<aside className={styles.aside} aria-label="Стоимость заказа">
						<OrderSummaryPanel
							totals={totals}
							contacts={contacts}
							delivery={delivery}
							company={company}
							paymentMethod={paymentMethod}
							pickupPoints={initialView.pickupPoints}
							transportCompanies={initialView.transportCompanies}
							promoField={
								<PromoCodeField
									applied={promo}
									onAppliedChange={handlePromoChange}
									cartKey={cartKey}
									onRevalidatingChange={setIsPromoRevalidating}
									disabled={!cart.validation.isValid || isCartMutating}
								/>
							}
							isStale={isStale}
							isSubmitting={isSubmitting}
							attemptStatus={attemptStatus}
							hasPendingAttempt={hasPendingAttempt}
							onSubmit={handleSubmit}
							errorEntries={errorEntries}
							formError={formError}
							cartIssue={cartIssue}
							summaryFocusToken={summaryFocusToken}
							panelRef={summaryRef}
						/>
					</aside>
				</div>

				<div className={styles.dockSpacer} aria-hidden />
			</PageContainer>

			<CheckoutDock
				total={totals.total}
				isStale={isStale}
				panelRef={summaryRef}
				onJump={handleJumpToSummary}
			/>
		</>
	);
}
