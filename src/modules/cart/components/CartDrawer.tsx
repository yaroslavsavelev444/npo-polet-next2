"use client";

import { X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { RemoveScroll } from "react-remove-scroll";
import { useCartPanel } from "../store/cart-panel.store";
import styles from "./Cart.module.css";
import { CartEmpty } from "./CartEmpty";
import { CartLineItem } from "./CartLineItem";
import {
	CartErrorNotice,
	CartUnavailableNotice,
	CartValidationNotice,
} from "./CartNotices";
import { CartOnboarding } from "./CartOnboarding";
import { CartProgress } from "./CartProgress";
import { CartSkeleton } from "./CartSkeleton";
import { CartSummary } from "./CartSummary";

interface Props {
	categories: { id: string; name: string; slug: string }[];
}

/**
 * Длительность ухода панели. Держим в JS и CSS синхронно: раньше размонтируем
 * — закрытие оборвётся на середине, позже — невидимая панель продолжит
 * перехватывать касания. Тот же приём и то же значение, что в MobileMenu.
 */
const CLOSE_MS = 300;

const FOCUSABLE =
	'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Выдвижная корзина.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ОДНА РЕАЛИЗАЦИЯ НА ВСЕ ШИРИНЫ
 * ────────────────────────────────────────────────────────────────────────────
 * Разницу между «панелью справа» и «экраном целиком» делает одна строка CSS
 * (ширина панели на <= 40rem), а не вторая ветка в разметке. Две реализации
 * разъезжаются при первой же правке: чинишь на десктопе — ломается на
 * телефоне.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ДОСТУПНОСТЬ
 * ────────────────────────────────────────────────────────────────────────────
 * Диалог модальный: фокус заперт внутри, Escape закрывает, после закрытия
 * фокус возвращается на элемент, которым панель открыли (обычно — иконка
 * корзины в шапке). Без возврата фокуса клавиатурный пользователь после
 * Escape оказывается в начале страницы — то есть теряет место, где был.
 *
 * Прокрутка страницы под панелью заблокирована (RemoveScroll), иначе
 * прокрутка списка «протекает» на страницу и та уезжает под открытой
 * корзиной.
 */
export function CartDrawer({ categories }: Props) {
	const isOpen = useCartPanel((s) => s.isOpen);
	const view = useCartPanel((s) => s.view);
	const status = useCartPanel((s) => s.status);
	const error = useCartPanel((s) => s.error);
	const isMutating = useCartPanel((s) => s.isMutating);
	const pending = useCartPanel((s) => s.pending);
	const isGuest = useCartPanel((s) => s.isGuest);
	const isOnboardingVisible = useCartPanel((s) => s.isOnboardingVisible);

	const close = useCartPanel((s) => s.close);
	const refresh = useCartPanel((s) => s.refresh);
	const setQuantity = useCartPanel((s) => s.setQuantity);
	const remove = useCartPanel((s) => s.remove);
	const clear = useCartPanel((s) => s.clear);
	const dismissOnboarding = useCartPanel((s) => s.dismissOnboarding);

	const router = useRouter();
	const pathname = usePathname();
	const titleId = useId();

	// mounted — присутствует ли панель в DOM (включая фазу закрытия);
	// entered — активна ли «открытая» стадия анимации.
	const [mounted, setMounted] = useState(false);
	const [entered, setEntered] = useState(false);
	const [isCheckingOut, setIsCheckingOut] = useState(false);

	const panelRef = useRef<HTMLDivElement>(null);
	const closeButtonRef = useRef<HTMLButtonElement>(null);
	const restoreFocusRef = useRef<HTMLElement | null>(null);

	useEffect(() => {
		if (isOpen) {
			// Элемент, с которого открыли, запоминается ДО монтирования панели —
			// после него активным станет уже что-то внутри диалога.
			restoreFocusRef.current = document.activeElement as HTMLElement | null;
			setMounted(true);
			// Двойной requestAnimationFrame гарантирует, что стартовые (закрытые)
			// стили успеют примениться до перехода в открытое состояние — иначе
			// браузер «схлопнет» анимацию и панель появится рывком.
			const raf = requestAnimationFrame(() =>
				requestAnimationFrame(() => setEntered(true)),
			);
			// Страховка на случай, когда кадров нет вовсе: на скрытой вкладке
			// requestAnimationFrame не вызывается, и без таймера панель осталась
			// бы смонтированной, но невидимой — при этом удерживая фокус и
			// перехватывая нажатия. Таймер длиннее двух кадров (60 Гц — 33 мс),
			// поэтому на нормальной вкладке он всегда опаздывает и ни на что не
			// влияет: setEntered(true) там уже произошёл.
			const fallback = setTimeout(() => setEntered(true), 80);
			return () => {
				cancelAnimationFrame(raf);
				clearTimeout(fallback);
			};
		}

		setEntered(false);
		const timeout = setTimeout(() => setMounted(false), CLOSE_MS);
		return () => clearTimeout(timeout);
	}, [isOpen]);

	// Фокус внутрь при открытии и обратно при закрытии.
	//
	// В зависимостях ОБЯЗАТЕЛЬНО и mounted, а не только isOpen. В том рендере,
	// где isOpen только стал true, панели в DOM ещё нет (mounted переключается
	// эффектом выше), и closeButtonRef пуст — фокус ушёл бы в никуда, а диалог
	// открылся бы с фокусом на <body>. Эффект должен сработать в тот момент,
	// когда панель уже смонтирована.
	useEffect(() => {
		if (!isOpen || !mounted) return;
		const restore = restoreFocusRef.current;
		// Кнопка закрытия — первое, на чём стоит оказаться: диалог обязан
		// сообщать способ выхода до того, как предложит что-то делать.
		//
		// Фокус ставится сразу, без requestAnimationFrame: эффект выполняется
		// уже после коммита, то есть кнопка в DOM гарантированно есть. Через
		// rAF доступность зависела бы от того, рисует ли браузер кадры, —
		// на скрытой вкладке фокус так и остался бы на <body>.
		closeButtonRef.current?.focus({ preventScroll: true });
		return () => {
			// Элемент мог исчезнуть (например, ушёл вместе с перерисовкой шапки) —
			// тогда фокус просто остаётся там, где был, а не улетает на <body>.
			if (restore?.isConnected) restore.focus({ preventScroll: true });
		};
	}, [isOpen, mounted]);

	// Переход по ссылке из панели закрывает её сам (onNavigate), но навигация
	// бывает и помимо этого — кнопкой «назад», например. Реакция строго на
	// pathname: close приходит из стора стабильной ссылкой, но держать в
	// зависимостях весь стор значило бы закрывать панель на каждом обновлении.
	const lastPathname = useRef(pathname);
	useEffect(() => {
		if (lastPathname.current === pathname) return;
		lastPathname.current = pathname;
		close();
		// Заодно снимаем флаг «идёт переход к оформлению»: страница сменилась,
		// значит переход состоялся. Без этого кнопка, нажатая перед уходом,
		// осталась бы в состоянии загрузки навсегда — её видно сразу же, стоит
		// вернуться кнопкой «назад».
		setIsCheckingOut(false);
	}, [pathname, close]);

	// Escape закрывает; Tab не выпускает фокус за пределы панели.
	const handleKeyDown = useCallback(
		(event: KeyboardEvent) => {
			if (event.key === "Escape") {
				event.preventDefault();
				close();
				return;
			}
			if (event.key !== "Tab") return;

			const panel = panelRef.current;
			if (!panel) return;

			const focusable = Array.from(
				panel.querySelectorAll<HTMLElement>(FOCUSABLE),
			).filter(
				(el) => el.offsetParent !== null || el === document.activeElement,
			);
			if (focusable.length === 0) return;

			const first = focusable[0];
			const last = focusable[focusable.length - 1];
			const active = document.activeElement as HTMLElement | null;

			if (!active || !panel.contains(active)) {
				event.preventDefault();
				first.focus();
			} else if (event.shiftKey && active === first) {
				event.preventDefault();
				last.focus();
			} else if (!event.shiftKey && active === last) {
				event.preventDefault();
				first.focus();
			}
		},
		[close],
	);

	useEffect(() => {
		if (!isOpen) return;
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [isOpen, handleKeyDown]);

	const handleCheckout = useCallback(() => {
		setIsCheckingOut(true);
		// Панель закрывается вместе с переходом: возвращаться со страницы
		// оформления в открытую поверх неё корзину незачем.
		close();
		router.push(isGuest ? "/auth/login?from=/checkout" : "/checkout");
	}, [close, isGuest, router]);

	if (!mounted || typeof document === "undefined") return null;

	const items = view?.items ?? [];
	const isLoading = status === "loading" && items.length === 0;
	const isEmpty = !isLoading && items.length === 0;
	const positionsLabel = view
		? `${view.summary.itemsCount} ${pluralizePositions(view.summary.itemsCount)} · ${view.summary.totalItems} шт.`
		: "";

	return createPortal(
		<RemoveScroll enabled={isOpen} removeScrollBar={false}>
			<div className={styles.root} data-open={entered}>
				{/* Затемнение — не кнопка, но нажатие по нему закрывает: это
				    привычный жест, а не единственный способ выхода (есть и крест,
				    и Escape), поэтому отдельной роли ему не нужно. */}
				<div className={styles.overlay} onClick={close} aria-hidden="true" />

				<div
					ref={panelRef}
					className={styles.panel}
					role="dialog"
					aria-modal="true"
					aria-labelledby={titleId}
				>
					<header className={styles.header}>
						<h2 className={styles.title} id={titleId}>
							Корзина
							{view && items.length > 0 && (
								<span className={styles.titleCount}>{positionsLabel}</span>
							)}
						</h2>
						<button
							ref={closeButtonRef}
							type="button"
							className={styles.close}
							onClick={close}
							aria-label="Закрыть корзину"
						>
							<X size={16} aria-hidden />
						</button>
					</header>

					{view && items.length > 0 && (
						<CartProgress
							discounts={view.discounts}
							appliedAmount={view.summary.centralDiscountAmount}
						/>
					)}

					<div className={styles.body}>
						{error && (
							<CartErrorNotice message={error} onRetry={() => void refresh()} />
						)}

						{view && view.unavailable.length > 0 && (
							<CartUnavailableNotice items={view.unavailable} />
						)}

						{view && !view.validation.isValid && (
							<CartValidationNotice issues={view.validation.issues} />
						)}

						{isLoading && <CartSkeleton />}

						{isEmpty && !isLoading && (
							<CartEmpty categories={categories} onNavigate={close} />
						)}

						{items.length > 0 && (
							<ul className={styles.list}>
								{items.map((item, index) => (
									<CartLineItem
										key={item.product.id}
										item={item}
										index={index}
										operation={pending[item.product.id]}
										onQuantityChange={(quantity) =>
											void setQuantity(item.product.id, quantity)
										}
										onRemove={() => void remove(item.product.id)}
										onNavigate={close}
									/>
								))}
							</ul>
						)}
					</div>

					{view && items.length > 0 && (
						<CartSummary
							summary={view.summary}
							isValid={view.validation.isValid}
							isStale={isMutating}
							isGuest={isGuest}
							isCheckingOut={isCheckingOut}
							onCheckout={handleCheckout}
							onClear={() => void clear()}
							onContinue={close}
						/>
					)}

					{isOnboardingVisible && (
						<CartOnboarding onDismiss={dismissOnboarding} />
					)}
				</div>
			</div>
		</RemoveScroll>,
		document.body,
	);
}

function pluralizePositions(count: number): string {
	const mod10 = count % 10;
	const mod100 = count % 100;
	if (mod100 >= 11 && mod100 <= 14) return "позиций";
	if (mod10 === 1) return "позиция";
	if (mod10 >= 2 && mod10 <= 4) return "позиции";
	return "позиций";
}
