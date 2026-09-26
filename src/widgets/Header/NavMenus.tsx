"use client";

import { ArrowUpRight, ChevronDown } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
	type CSSProperties,
	type KeyboardEvent as ReactKeyboardEvent,
	type PointerEvent as ReactPointerEvent,
	useCallback,
	useEffect,
	useId,
	useRef,
	useState,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/utils/cn";
import { CatalogPanel } from "./CatalogPanel";
import type { CatalogMenuData } from "./catalog-menu";
import styles from "./NavMenus.module.css";

/**
 * Навигация шапки на desktop: «Каталог», «Ресурсы», «О нас».
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ОДНА ШТОРКА НА ТРИ МЕНЮ
 * ────────────────────────────────────────────────────────────────────────────
 * Меню — не три выпадающих списка, а одна полоса во всю ширину, которая
 * выезжает из-под шапки. Переход с «Каталога» на «Ресурсы» не закрывает и не
 * открывает её заново: полоса меняет высоту под новое содержимое, а оно
 * сменяется со сдвигом в сторону движения курсора. Три отдельных всплывающих
 * окна на таком переходе мигали бы — закрытие одного, открытие другого.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * НАВЕДЕНИЕ ОТКРЫВАЕТ, КЛИК ВЕДЁТ
 * ────────────────────────────────────────────────────────────────────────────
 * Мышью меню открывается наведением, а клик по «Каталогу» — обычная ссылка на
 * /category. Раньше на страницу каталога из шапки попасть было нельзя: клик
 * был занят открытием списка.
 *
 * Прежняя причина отказа от hover — тап синтезирует mouseenter, и меню
 * открывалось и тут же закрывалось кликом — здесь снята иначе: наведение
 * читается из pointerType. Палец и перо событием наведения не считаются, у
 * них остаются клики: по «Каталогу» — переход, по стрелке рядом — меню.
 *
 * Намерение, а не касание: открытие ждёт 70 мс (курсор, пролетевший над
 * шапкой по пути к поиску, меню не дёргает), закрытие — 200 мс (путь от
 * пункта к шторке и мелкий промах мимо неё его не закрывают).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * КЛАВИАТУРА
 * ────────────────────────────────────────────────────────────────────────────
 * Шаблон «навигация с раскрывающимися разделами» (WAI-ARIA disclosure): у
 * «Каталога» ссылка и отдельная кнопка-стрелка с aria-expanded, у остальных
 * пунктов — кнопки. Открытое с клавиатуры меню забирает фокус на первую
 * ссылку; Tab с последней возвращает его в шапку к следующему пункту — шторка
 * лежит в конце документа (портал), и без этого фокус ушёл бы в подвал.
 * Escape закрывает и возвращает фокус на пункт.
 */

type MenuId = "catalog" | "resources" | "about";

const MENU_ORDER: MenuId[] = ["catalog", "resources", "about"];

const OPEN_DELAY_MS = 70;
const CLOSE_DELAY_MS = 200;

interface LinkItem {
	label: string;
	href: string;
	hint: string;
}

/** Подписи — из описаний самих страниц (metadata), а не придуманные заново. */
const LINK_MENUS: Record<
	Exclude<MenuId, "catalog">,
	{ title: string; items: LinkItem[] }
> = {
	resources: {
		title: "Ресурсы",
		items: [
			{
				label: "База знаний",
				href: "/knowledge",
				hint: "Руководства, инструкции и разборы",
			},
			{
				label: "Вопросы и ответы",
				href: "/faq",
				hint: "Применение, покупка, доставка, обслуживание",
			},
		],
	},
	about: {
		title: "О нас",
		items: [
			{
				label: "Контакты",
				href: "/contacts",
				hint: "Телефоны, почта и адреса",
			},
			{
				// Раньше пункт вёл на /agreements — такого маршрута нет,
				// документы живут на /consents.
				label: "Соглашения",
				href: "/consents",
				hint: "Пользовательские соглашения и согласия на обработку данных",
			},
		],
	},
};

const FOCUSABLE = "a[href], button:not([disabled])";

function isHoverPointer(event: ReactPointerEvent) {
	return event.pointerType === "mouse";
}

export default function NavMenus({
	catalogMenu,
}: {
	catalogMenu: CatalogMenuData;
}) {
	const pathname = usePathname();
	const baseId = useId();
	const panelId = (menu: MenuId) => `${baseId}-${menu}`;

	const [active, setActive] = useState<MenuId | null>(null);
	// Шторка рисует содержимое только после первого намерения открыть её:
	// превью каталога — это десятки фотографий, и грузить их на каждой
	// странице ради меню, которое могут не открыть, незачем.
	const [primed, setPrimed] = useState(false);
	const [portalReady, setPortalReady] = useState(false);
	const [headerBottom, setHeaderBottom] = useState(0);
	const [heights, setHeights] = useState<Partial<Record<MenuId, number>>>({});

	const activeRef = useRef<MenuId | null>(null);
	const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const triggerRefs = useRef<Partial<Record<MenuId, HTMLElement | null>>>({});
	const panelRefs = useRef<Partial<Record<MenuId, HTMLDivElement | null>>>({});
	const sheetRef = useRef<HTMLDivElement>(null);
	const navRef = useRef<HTMLDivElement>(null);
	// Фокус переносится в шторку только если её открыли с клавиатуры.
	const focusOnOpen = useRef(false);
	// Чем нажали пункт: клик мышью меню не закрывает — к нему оно уже
	// открыто наведением, и клик читался бы как «закрыть».
	const lastPointer = useRef("");
	// Кнопка, которой меню открыли, — на неё Escape возвращает фокус.
	const openerRef = useRef<HTMLElement | null>(null);

	activeRef.current = active;

	const clearTimers = useCallback(() => {
		if (openTimer.current) clearTimeout(openTimer.current);
		if (closeTimer.current) clearTimeout(closeTimer.current);
		openTimer.current = null;
		closeTimer.current = null;
	}, []);

	const close = useCallback(() => {
		clearTimers();
		setActive(null);
	}, [clearTimers]);

	const intendOpen = useCallback(
		(menu: MenuId) => {
			setPrimed(true);
			clearTimers();
			// Шторка уже открыта — переключаемся сразу, без ожидания: курсор
			// ведёт по пунктам, и задержка здесь читалась бы как торможение.
			if (activeRef.current) {
				setActive(menu);
				return;
			}
			openerRef.current = null;
			openTimer.current = setTimeout(() => setActive(menu), OPEN_DELAY_MS);
		},
		[clearTimers],
	);

	const intendClose = useCallback(() => {
		if (openTimer.current) clearTimeout(openTimer.current);
		openTimer.current = null;
		if (closeTimer.current) clearTimeout(closeTimer.current);
		closeTimer.current = setTimeout(() => setActive(null), CLOSE_DELAY_MS);
	}, []);

	const cancelClose = useCallback(() => {
		if (closeTimer.current) clearTimeout(closeTimer.current);
		closeTimer.current = null;
	}, []);

	const toggle = useCallback(
		(menu: MenuId, fromKeyboard: boolean) => {
			setPrimed(true);
			clearTimers();
			const byMouse = lastPointer.current === "mouse";
			lastPointer.current = "";
			if (activeRef.current === menu && !byMouse) {
				setActive(null);
				return;
			}
			focusOnOpen.current = fromKeyboard;
			openerRef.current =
				document.activeElement instanceof HTMLElement
					? document.activeElement
					: null;
			setActive(menu);
		},
		[clearTimers],
	);

	useEffect(() => {
		setPortalReady(true);
		return clearTimers;
	}, [clearTimers]);

	// Переход на другую страницу закрывает меню — в том числе «назад» в
	// браузере, который мимо onClick ссылок.
	// biome-ignore lint/correctness/useExhaustiveDependencies: реакция именно на смену пути
	useEffect(() => {
		close();
	}, [pathname]);

	// Шторка начинается ровно под шапкой. Высота шапки меняется (служебная
	// полоса видна не на всех ширинах), поэтому наблюдение, а не разовый замер.
	useEffect(() => {
		if (!primed) return;
		const header = document.querySelector<HTMLElement>("[data-sticky-header]");
		if (!header) return;
		const update = () =>
			setHeaderBottom(Math.round(header.getBoundingClientRect().bottom));
		update();
		const observer = new ResizeObserver(update);
		observer.observe(header);
		return () => observer.disconnect();
	}, [primed]);

	// Высота каждой панели — для анимации высоты шторки при смене меню.
	useEffect(() => {
		if (!primed) return;
		const observer = new ResizeObserver((entries) => {
			setHeights((previous) => {
				const next = { ...previous };
				for (const entry of entries) {
					const menu = (entry.target as HTMLElement).dataset.menu as MenuId;
					next[menu] = Math.ceil(entry.contentRect.height);
				}
				return next;
			});
		});
		for (const menu of MENU_ORDER) {
			const panel = panelRefs.current[menu];
			if (panel) observer.observe(panel);
		}
		return () => observer.disconnect();
	}, [primed]);

	// Открытое меню слушает Escape и касание мимо — второе нужно для
	// открытого пальцем или клавиатурой: курсора, который «уйдёт», там нет.
	useEffect(() => {
		if (!active) return;

		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			// Фокус возвращается туда, откуда меню открыли: у «Каталога» это
			// стрелка, а не ссылка рядом.
			const trigger =
				openerRef.current ??
				triggerRefs.current[activeRef.current ?? "catalog"];
			close();
			trigger?.focus();
		};
		const onPointerDown = (event: PointerEvent) => {
			const target = event.target as Node;
			if (
				navRef.current?.contains(target) ||
				sheetRef.current?.contains(target)
			)
				return;
			close();
		};
		// Меню только для desktop: ниже lg пунктов шапки нет, и открытая
		// шторка осталась бы висеть без хозяина.
		const desktop = window.matchMedia("(min-width: 1024px)");
		const onMediaChange = () => {
			if (!desktop.matches) close();
		};

		document.addEventListener("keydown", onKeyDown);
		document.addEventListener("pointerdown", onPointerDown);
		desktop.addEventListener("change", onMediaChange);
		return () => {
			document.removeEventListener("keydown", onKeyDown);
			document.removeEventListener("pointerdown", onPointerDown);
			desktop.removeEventListener("change", onMediaChange);
		};
	}, [active, close]);

	// Открытое с клавиатуры меню получает фокус на первую ссылку — после
	// кадра, когда панель уже видима (visibility переключается переходом).
	useEffect(() => {
		if (!active || !focusOnOpen.current) return;
		focusOnOpen.current = false;
		const frame = requestAnimationFrame(() => {
			panelRefs.current[active]?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
		});
		return () => cancelAnimationFrame(frame);
	}, [active]);

	// Tab по краям шторки возвращает фокус в шапку: с последней ссылки — на
	// следующий пункт навигации, с первой назад — на сам пункт.
	const onSheetKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
		if (event.key !== "Tab" || !active) return;
		const panel = panelRefs.current[active];
		if (!panel) return;
		const focusables = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)];
		const first = focusables[0];
		const last = focusables[focusables.length - 1];
		const trigger = triggerRefs.current[active];

		if (event.shiftKey && document.activeElement === first) {
			event.preventDefault();
			trigger?.focus();
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault();
			const next = MENU_ORDER[MENU_ORDER.indexOf(active) + 1];
			close();
			(next ? triggerRefs.current[next] : trigger)?.focus();
		}
	};

	// Фокус ушёл и из шапки, и из шторки — меню закрывается.
	const onBlurWithin = (event: React.FocusEvent) => {
		const next = event.relatedTarget as Node | null;
		if (!next) return;
		if (navRef.current?.contains(next) || sheetRef.current?.contains(next))
			return;
		close();
	};

	const hoverHandlers = (menu: MenuId) => ({
		onPointerEnter: (event: ReactPointerEvent) => {
			if (isHoverPointer(event)) intendOpen(menu);
		},
		onPointerLeave: (event: ReactPointerEvent) => {
			if (isHoverPointer(event)) intendClose();
		},
	});

	const sheetHeight = active ? (heights[active] ?? 0) : 0;

	return (
		<>
			<div
				ref={navRef}
				className={styles.nav}
				onBlur={onBlurWithin}
				// Наведение на полосу навигации «прогревает» шторку: содержимое
				// начинает грузиться раньше, чем истечёт задержка открытия.
				onPointerEnter={() => setPrimed(true)}
			>
				<div className={styles.item} {...hoverHandlers("catalog")}>
					<Link
						ref={(node) => {
							triggerRefs.current.catalog = node;
						}}
						href="/category"
						className={styles.trigger}
						data-active={active === "catalog" || undefined}
						onClick={() => close()}
					>
						Каталог
					</Link>
					<button
						type="button"
						className={styles.chevron}
						aria-label="Разделы каталога"
						aria-expanded={active === "catalog"}
						aria-controls={panelId("catalog")}
						data-active={active === "catalog" || undefined}
						onPointerDown={(event) => {
							lastPointer.current = event.pointerType;
						}}
						onClick={(event) => toggle("catalog", event.detail === 0)}
					>
						<ChevronDown aria-hidden className={styles.chevronIcon} />
					</button>
				</div>

				{(["resources", "about"] as const).map((menu) => (
					<div key={menu} className={styles.item} {...hoverHandlers(menu)}>
						<button
							ref={(node) => {
								triggerRefs.current[menu] = node;
							}}
							type="button"
							className={styles.trigger}
							aria-expanded={active === menu}
							aria-controls={panelId(menu)}
							data-active={active === menu || undefined}
							onPointerDown={(event) => {
								lastPointer.current = event.pointerType;
							}}
							onClick={(event) => toggle(menu, event.detail === 0)}
						>
							{LINK_MENUS[menu].title}
							<ChevronDown aria-hidden className={styles.chevronIcon} />
						</button>
					</div>
				))}
			</div>

			{portalReady
				? createPortal(
						<>
							<div
								className={styles.scrim}
								data-open={active ? "true" : "false"}
								style={{ top: headerBottom }}
								aria-hidden="true"
							/>
							<div
								ref={sheetRef}
								className={styles.sheet}
								data-open={active ? "true" : "false"}
								style={
									{
										top: headerBottom,
										"--sheet-h": `${sheetHeight}px`,
									} as CSSProperties
								}
								onPointerEnter={(event) => {
									if (isHoverPointer(event)) cancelClose();
								}}
								onPointerLeave={(event) => {
									if (isHoverPointer(event)) intendClose();
								}}
								onKeyDown={onSheetKeyDown}
								onBlur={onBlurWithin}
							>
								<div className={styles.surface} aria-hidden="true">
									<span className={styles.surfaceRule} />
								</div>

								<div className={styles.stage}>
									{MENU_ORDER.map((menu, index) => {
										const isActive = active === menu;
										// Где панель ждёт своей очереди: правее открытой — справа,
										// левее — слева. Переход «Каталог → Ресурсы» уводит старое
										// влево и приводит новое справа — туда, куда ушёл курсор.
										// Пока шторка закрыта, сторон нет: она открывается и
										// закрывается без бокового сдвига.
										const side = active
											? Math.sign(index - MENU_ORDER.indexOf(active))
											: 0;
										return (
											<div
												key={menu}
												id={panelId(menu)}
												ref={(node) => {
													panelRefs.current[menu] = node;
												}}
												data-menu={menu}
												data-active={isActive ? "true" : "false"}
												className={styles.panel}
												style={{ "--side": side } as CSSProperties}
												// Скрытая панель недоступна ни фокусу, ни скринридеру.
												inert={!isActive}
											>
												{primed ? (
													menu === "catalog" ? (
														<CatalogPanel
															data={catalogMenu}
															active={isActive}
															onNavigate={close}
														/>
													) : (
														<LinksPanel
															title={LINK_MENUS[menu].title}
															items={LINK_MENUS[menu].items}
															onNavigate={close}
														/>
													)
												) : null}
											</div>
										);
									})}
								</div>
							</div>
						</>,
						document.body,
					)
				: null}
		</>
	);
}

/**
 * «Ресурсы» и «О нас»: крупные строки-ссылки с пояснением. Тот же ритм, что у
 * каталога слева — моноширинная подпись раздела, затем пункты.
 */
function LinksPanel({
	title,
	items,
	onNavigate,
}: {
	title: string;
	items: LinkItem[];
	onNavigate: () => void;
}) {
	return (
		<div className={cn(styles.inner, styles.links)}>
			<p
				className={cn(styles.label, styles.reveal)}
				style={{ "--i": 0 } as CSSProperties}
			>
				{title}
			</p>
			<ul className={styles.linkList}>
				{items.map((item, index) => (
					<li
						key={item.href}
						className={styles.reveal}
						style={{ "--i": index + 1 } as CSSProperties}
					>
						<Link
							href={item.href}
							className={styles.linkCard}
							onClick={onNavigate}
						>
							<span className={styles.linkTitle}>{item.label}</span>
							<span className={styles.linkHint}>{item.hint}</span>
							<ArrowUpRight aria-hidden className={styles.linkArrow} />
						</Link>
					</li>
				))}
			</ul>
		</div>
	);
}
