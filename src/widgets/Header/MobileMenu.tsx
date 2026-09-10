"use client";

import { LogIn, ShoppingCart } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { RemoveScroll } from "react-remove-scroll";
import { logoutAction } from "@/modules/auth/actions/logout";
import type { Category, Setting, User } from "@/payload-types";
import { useCartPanel } from "@/modules/cart/store/cart-panel.store";
import { useCartStore } from "@/shared/store/cart.store";
import { getPrimaryEmail, getPrimaryPhone } from "@/utils/settings-helpers";
import styles from "./MobileMenu.module.css";
import {
	getPrimaryLinks,
	getSecondaryLinks,
	isLinkActive,
} from "./mobile-menu-links";

interface Props {
	isOpen: boolean;
	onClose: () => void;
	user: User | null;
	categories: Category[];
	settings: Setting | null;
	cartItemCount: number;
	/** Бургер в шапке: он же кнопка закрытия, поэтому входит в цикл Tab. */
	triggerRef: React.RefObject<HTMLButtonElement | null>;
	panelId: string;
}

/**
 * Длительность ухода панели. Держим в JS и CSS синхронно: раньше
 * размонтируем — закрытие оборвётся на середине, позже — панель будет
 * невидимо перехватывать касания.
 */
const CLOSE_MS = 320;

/** Сколько категорий показываем плитками. Дальше список перестаёт быть
 * «быстрым переходом» и превращается во второй каталог. */
const MAX_CATEGORY_CHIPS = 8;

/** Подпись внизу панели — строка из hero главной. Один и тот же голос на
 * витрине и в навигации. */
const STRAPLINE = "Перехват, а не поражение";

const FOCUSABLE =
	'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

export default function MobileMenu({
	isOpen,
	onClose,
	user,
	categories,
	settings,
	cartItemCount,
	triggerRef,
	panelId,
}: Props) {
	// mounted — присутствует ли панель в DOM (включая фазу закрытия);
	// entered — активна ли «открытая» стадия анимации.
	const [mounted, setMounted] = useState(false);
	const [entered, setEntered] = useState(false);
	// Фактическая высота шапки в пикселях. Замер, а не токен: см. комментарий
	// у data-sticky-header в StickyHeader.tsx.
	const [headerOffset, setHeaderOffset] = useState<number | null>(null);
	const panelRef = useRef<HTMLDivElement>(null);
	const closeButtonRef = useRef<HTMLButtonElement>(null);
	const pathname = usePathname();

	const isAuthenticated = Boolean(user);
	const primaryLinks = getPrimaryLinks(isAuthenticated);
	const secondaryLinks = getSecondaryLinks(isAuthenticated);
	const phone = getPrimaryPhone(settings);
	const email = getPrimaryEmail(settings);

	// Счётчик корзины живёт в сторе (его наполняет CartIcon в шапке). До
	// гидратации стор пуст, поэтому до неё показываем серверное значение —
	// иначе при открытии меню бейдж на мгновение показывал бы ноль.
	const cartHydrated = useCartStore((s) => s.hydrated);
	const cartCount = useCartStore((s) => s.itemCount);
	const cartBadge = cartHydrated ? cartCount : cartItemCount;
	const openCart = useCartPanel((s) => s.open);

	useEffect(() => {
		if (isOpen) {
			setMounted(true);
			// Двойной requestAnimationFrame гарантирует, что стартовые (закрытые)
			// стили успеют примениться до перехода в открытое состояние — иначе
			// браузер «схлопнет» анимацию и панель появится рывком.
			const raf = requestAnimationFrame(() =>
				requestAnimationFrame(() => setEntered(true)),
			);
			return () => cancelAnimationFrame(raf);
		}

		setEntered(false);
		const timeout = setTimeout(() => setMounted(false), CLOSE_MS);
		return () => clearTimeout(timeout);
	}, [isOpen]);

	// Шапка выше на планшете (там показан TopHeader) и может поменять высоту
	// при повороте экрана — поэтому не разовый замер, а наблюдение.
	useEffect(() => {
		if (!mounted) return;
		const header = document.querySelector<HTMLElement>("[data-sticky-header]");
		if (!header) return;

		const update = () =>
			setHeaderOffset(Math.round(header.getBoundingClientRect().bottom));
		update();

		const observer = new ResizeObserver(update);
		observer.observe(header);
		window.addEventListener("resize", update);
		return () => {
			observer.disconnect();
			window.removeEventListener("resize", update);
		};
	}, [mounted]);

	// Переход по ссылке закрывает меню сразу (onClick), но навигация бывает и
	// помимо него — например, кнопкой «назад». Смена пути гасит панель в любом
	// случае.
	//
	// Реакция строго на pathname: onClose приходит из родителя новой стрелкой
	// на каждый рендер, и держать его в зависимостях означало бы закрывать
	// меню на любом ре-рендере — то есть сразу после открытия.
	const latest = useRef({ isOpen, onClose });
	useEffect(() => {
		latest.current = { isOpen, onClose };
	});
	const lastPathname = useRef(pathname);
	useEffect(() => {
		if (lastPathname.current === pathname) return;
		lastPathname.current = pathname;
		if (latest.current.isOpen) latest.current.onClose();
	}, [pathname]);

	// Фокус уводим внутрь панели при открытии и возвращаем на бургер при
	// закрытии — иначе после Escape фокус остаётся на элементе, которого
	// пользователь уже не видит.
	useEffect(() => {
		if (!isOpen) return;
		const trigger = triggerRef.current;
		closeButtonRef.current?.focus({ preventScroll: true });
		return () => trigger?.focus({ preventScroll: true });
	}, [isOpen, triggerRef]);

	// Escape закрывает; Tab не выпускает фокус за пределы «бургер + панель».
	// Бургер включён в цикл намеренно: визуально он часть открытого меню и
	// служит его кнопкой закрытия.
	const handleKeyDown = useCallback(
		(event: KeyboardEvent) => {
			if (event.key === "Escape") {
				event.preventDefault();
				onClose();
				return;
			}
			if (event.key !== "Tab") return;

			const panel = panelRef.current;
			if (!panel) return;

			const inPanel = Array.from(
				panel.querySelectorAll<HTMLElement>(FOCUSABLE),
			).filter(
				(el) => el.offsetParent !== null || el === document.activeElement,
			);
			const trigger = triggerRef.current;
			const cycle = trigger ? [trigger, ...inPanel] : inPanel;
			if (cycle.length === 0) return;

			const first = cycle[0];
			const last = cycle[cycle.length - 1];
			const active = document.activeElement as HTMLElement | null;

			if (!active || !cycle.includes(active)) {
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
		[onClose, triggerRef],
	);

	useEffect(() => {
		if (!isOpen) return;
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [isOpen, handleKeyDown]);

	if (!mounted || typeof document === "undefined") return null;

	const chips = categories.slice(0, MAX_CATEGORY_CHIPS);
	// Каскад продолжается сквозь блоки: индекс не сбрасывается на каждой
	// секции, иначе подпись внизу появлялась бы одновременно с первой ссылкой.
	let order = primaryLinks.length;

	return createPortal(
		<RemoveScroll enabled={isOpen} removeScrollBar={false}>
			<div
				id={panelId}
				ref={panelRef}
				className={styles.overlay}
				style={
					headerOffset != null
						? ({ "--menu-top": `${headerOffset}px` } as React.CSSProperties)
						: undefined
				}
				data-open={entered}
				role="dialog"
				aria-modal="true"
				aria-label="Меню навигации"
			>
				<div className={styles.inner}>
					<button
						ref={closeButtonRef}
						type="button"
						onClick={onClose}
						className={styles.srOnly}
					>
						Закрыть меню
					</button>

					<nav aria-label="Основная навигация">
						<ol className={styles.primary}>
							{primaryLinks.map((link, index) => (
								<li
									key={link.href}
									className={styles.reveal}
									style={{ "--i": index } as React.CSSProperties}
								>
									<Link
										href={link.href}
										onClick={onClose}
										aria-label={link.label}
										aria-current={
											isLinkActive(pathname, link.href) ? "page" : undefined
										}
										className={styles.link}
									>
										<span className={styles.idx} aria-hidden>
											{String(index + 1).padStart(2, "0")}_
										</span>
										<span className={styles.label} aria-hidden>
											<RollingText text={link.label} />
										</span>
									</Link>
								</li>
							))}
						</ol>
					</nav>

					{chips.length > 0 && (
						<section
							className={`${styles.section} ${styles.reveal}`}
							style={{ "--i": order++ } as React.CSSProperties}
							aria-labelledby={`${panelId}-categories`}
						>
							<h2 className={styles.sectionLabel} id={`${panelId}-categories`}>
								Категории
							</h2>
							<div className={styles.chips}>
								{chips.map((category) => {
									const href = `/category/${category.slug}`;
									return (
										<Link
											key={category.id}
											href={href}
											onClick={onClose}
											title={category.name}
											aria-current={
												isLinkActive(pathname, href) ? "page" : undefined
											}
											className={styles.chip}
										>
											{category.name}
										</Link>
									);
								})}
							</div>
						</section>
					)}

					<div
						className={`${styles.cta} ${styles.reveal}`}
						style={{ "--i": order++ } as React.CSSProperties}
					>
						{/* Корзина открывается панелью поверх страницы, а не переходом:
						    ровно так же, как со значка в шапке. Меню при этом
						    закрывается — два наложенных слоя одновременно не нужны.
						    Гостю кнопка показывается наравне с вошедшим: корзина
						    работает и без аккаунта. */}
						<button
							type="button"
							onClick={() => {
								onClose();
								openCart("user");
							}}
							aria-haspopup="dialog"
							className={styles.ctaButton}
						>
							<ShoppingCart className={styles.ctaIcon} aria-hidden />
							Корзина
							{cartBadge > 0 && (
								<span className={styles.ctaCount}>
									{cartBadge > 99 ? "99+" : cartBadge}
								</span>
							)}
						</button>

						{!isAuthenticated && (
							<Link
								href="/auth/login"
								onClick={onClose}
								className={styles.ctaButton}
							>
								<LogIn className={styles.ctaIcon} aria-hidden />
								Войти
							</Link>
						)}

						{(phone || email) && (
							<div className={styles.talk}>
								{phone && (
									<a href={`tel:${phone}`} className={styles.talkLink}>
										{phone}
									</a>
								)}
								{email && (
									<a href={`mailto:${email}`} className={styles.talkLink}>
										{email}
									</a>
								)}
							</div>
						)}
					</div>

					<p
						className={`${styles.strap} ${styles.reveal}`}
						style={{ "--i": order++ } as React.CSSProperties}
					>
						{STRAPLINE}
					</p>

					<div
						className={`${styles.foot} ${styles.reveal}`}
						style={{ "--i": order++ } as React.CSSProperties}
					>
						{secondaryLinks.map((link) => (
							<Link
								key={link.href}
								href={link.href}
								onClick={onClose}
								aria-label={link.label}
								aria-current={
									isLinkActive(pathname, link.href) ? "page" : undefined
								}
								className={styles.footLink}
							>
								<span aria-hidden>
									<RollingText text={link.label} />
								</span>
							</Link>
						))}

						{isAuthenticated && (
							<form action={logoutAction}>
								<button
									type="submit"
									onClick={onClose}
									aria-label="Выйти из аккаунта"
									className={`${styles.footLink} ${styles.footLogout}`}
								>
									<span aria-hidden>
										<RollingText text="Выйти" />
									</span>
								</button>
							</form>
						)}

						<Link
							href="/"
							onClick={onClose}
							className={styles.footLink}
							aria-current={pathname === "/" ? "page" : undefined}
							aria-label="На главную"
						>
							<span aria-hidden>
								<RollingText text="На главную" />
							</span>
						</Link>
					</div>
				</div>
			</div>
		</RemoveScroll>,
		document.body,
	);
}

/**
 * Подпись, знаки которой при наведении перекатываются вверх.
 *
 * Разбивка идёт по словам, а не по всей строке: слово держится вместе
 * (`white-space: nowrap` на обёртке), а перенос между словами остаётся
 * обычным. Без этого «БАЗА ЗНАНИЙ» в очень широкой PaluiSP2 не уместилось бы
 * на узком экране ни в одну строку и полезло бы за край.
 *
 * Задержка на знак (12 мс) пускает перекат волной слева направо. Сама строка
 * скрыта от скринридеров — доступное имя ссылка получает из aria-label.
 */
function RollingText({ text }: { text: string }) {
	const words = text.split(" ");
	let charIndex = 0;

	return (
		<>
			{words.map((word, wordIndex) => (
				<span key={`${word}-${wordIndex}`}>
					{wordIndex > 0 && " "}
					<span className={styles.roll}>
						{Array.from(word).map((char, i) => (
							<span
								key={`${char}-${i}`}
								style={{ transitionDelay: `${charIndex++ * 12}ms` }}
							>
								{char}
							</span>
						))}
					</span>
				</span>
			))}
		</>
	);
}
