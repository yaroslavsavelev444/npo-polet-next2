"use client";

import { X } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { RemoveScroll } from "react-remove-scroll";
import { buttonStyles } from "@/UI/Button/Button.styles";
import { cn } from "@/utils/cn";
import type { BannerActionView, BannerView } from "../types";

// Модальное окно баннера.
//
// ─── Что этот компонент знает и чего не знает ──────────────────────────────
//
// Знает: как выглядит баннер и что пользователь с ним сделал. Не знает: кому он
// положен, почему пришёл, сколько раз показывался и покажется ли снова. Всё это
// решает сервер, и требование «не связывать бизнес-логику с UI-компонентом»
// выполнено буквально — в файле нет ни одного обращения к сети и ни одной
// ветки по условиям показа.
//
// ─── Почему не общий `UI/Modal`, если он есть ──────────────────────────────
//
// `UI/Modal` жёстко задаёт шапку с заголовком и крестиком, отступы `px-6 py-5`
// и границу под шапкой. Для режима «фон» это неверно трижды: картинка обязана
// доходить до краёв (никакого внутреннего отступа), заголовок лежит ПОВЕРХ
// снимка, а не в отдельной полосе, и крестик поверх фотографии нуждается в
// собственной подложке — иначе он теряется на светлом кадре. Использованы те же
// примитивы (нативный `<dialog>`, `createPortal`, `RemoveScroll`) и те же
// токены темы, так что окно остаётся частью системы; отличается ровно то, что
// обязано отличаться.

export type BannerCloseCause = "close-button" | "overlay" | "escape";

export function BannerModal({
	banner,
	onClose,
	onCta,
	onLink,
}: {
	banner: BannerView;
	onClose: (cause: BannerCloseCause) => void;
	onCta: (action: BannerActionView) => void;
	onLink: (action: BannerActionView) => void;
}) {
	const titleId = useId();
	const bodyId = useId();
	const dialogRef = useRef<HTMLDialogElement>(null);
	const closeRef = useRef<HTMLButtonElement>(null);
	const [mounted, setMounted] = useState(false);

	// Портал ставится только после монтирования: `createPortal` в `document.body`
	// на сервере рендерить нечего, а при гидратации даёт расхождение разметки.
	useEffect(() => setMounted(true), []);

	// ⚠ Зависимость от `mounted` — ОБЯЗАТЕЛЬНА, а не декоративна.
	//
	// До первого эффекта компонент возвращает `null`, то есть ни портала, ни
	// самого `<dialog>` ещё не существует и `dialogRef.current` пуст. Эффект с
	// пустым списком зависимостей отработал бы ровно в этот момент — один раз и
	// вхолостую, — и окно навсегда осталось бы в разметке с `display: none`.
	// Ошибка при этом БЕСШУМНАЯ: показ засчитывается, событие «прочитал»
	// отправляется по таймеру, в отчётах всё выглядит идеально, и только
	// пользователь не видит ничего.
	// biome-ignore lint/correctness/useExhaustiveDependencies: `mounted` в теле не читается, но отмечает момент, когда портал уже в документе — см. объяснение выше.
	useEffect(() => {
		const element = dialogRef.current;
		if (!element || element.open) return;

		element.showModal();

		// Фокус уходит на крестик, а не на кнопку действия.
		//
		// `showModal` фокусирует первый интерактивный элемент — здесь это CTA.
		// Модалка приходит незваной, поверх того, что человек в этот момент
		// делал, и рефлекторный пробел или Enter увёл бы его по ссылке, которую
		// он не выбирал. Первым под рукой должен быть выход.
		closeRef.current?.focus();
	}, [mounted]);

	// `cancel` — это Escape. Перехватывается отдельно от клика мимо окна, потому
	// что способ закрытия записывается: «убрал с дороги» и «осознанно
	// отказался» — разные факты, и в отчёте они должны различаться.
	// biome-ignore lint/correctness/useExhaustiveDependencies: `mounted` — по той же причине, что у эффекта выше: до него `dialogRef.current` пуст и подписка не состоялась бы.
	useEffect(() => {
		const element = dialogRef.current;
		if (!element) return;

		const handle = (event: Event) => {
			event.preventDefault();
			onClose("escape");
		};

		element.addEventListener("cancel", handle);
		return () => element.removeEventListener("cancel", handle);
	}, [mounted, onClose]);

	const onBackdropClick = useCallback(
		(event: React.MouseEvent<HTMLDialogElement>) => {
			if (event.target === dialogRef.current) onClose("overlay");
		},
		[onClose],
	);

	if (!mounted) return null;

	const background = banner.image?.mode === "background";

	return createPortal(
		<RemoveScroll enabled>
			<dialog
				ref={dialogRef}
				onClick={onBackdropClick}
				aria-labelledby={titleId}
				aria-describedby={banner.body ? bodyId : undefined}
				className={cn(
					"m-auto w-[calc(100vw-2rem)] max-w-md overflow-hidden border-none bg-transparent p-0 outline-none",
					"open:flex",
					"backdrop:bg-[var(--overlay)] backdrop:backdrop-blur-sm",
				)}
				// Высота ограничена окном просмотра, а прокручивается только текст:
				// модалка на телефоне с длинным текстом и кнопкой внизу иначе
				// прячет кнопку за нижним краем экрана — то есть теряет ровно то,
				// ради чего показана.
				style={{ maxHeight: "min(90dvh, 44rem)" }}
			>
				<div
					className={cn(
						"relative flex w-full flex-col overflow-hidden rounded-[var(--radius-lg)] border",
						"border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)]",
						"shadow-[0_24px_64px_rgba(0,0,0,0.5)]",
					)}
					style={{ maxHeight: "min(90dvh, 44rem)" }}
				>
					{background && banner.image ? (
						<BackgroundLayout
							banner={banner}
							titleId={titleId}
							bodyId={bodyId}
							onCta={onCta}
							onLink={onLink}
						/>
					) : (
						<PostLayout
							banner={banner}
							titleId={titleId}
							bodyId={bodyId}
							onCta={onCta}
							onLink={onLink}
						/>
					)}

					{/*
					 * Кнопка закрытия есть всегда. На фоновом режиме у неё
					 * собственная подложка: крестик без неё исчезает на светлом
					 * снимке, и модалка выглядит незакрываемой.
					 */}
					<button
						ref={closeRef}
						type="button"
						aria-label="Закрыть"
						onClick={() => onClose("close-button")}
						className={cn(
							// Зона нажатия расширена псевдоэлементом при прежнем размере
							// кнопки. Нарисованные 32px попадают в систему, но пальцем в
							// них не попасть — а это единственный выход из окна, которое
							// человек не открывал.
							"absolute top-3 right-3 z-10 flex h-8 w-8 items-center justify-center",
							"rounded-[var(--radius-sm)] transition-colors duration-150",
							"before:absolute before:-inset-2.5 before:content-['']",
							"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]",
							background
								? "bg-black/45 text-white backdrop-blur-sm hover:bg-black/65"
								: "text-[var(--text-muted)] hover:bg-[var(--surface-secondary)] hover:text-[var(--text-primary)]",
						)}
					>
						<X className="h-4 w-4" aria-hidden />
					</button>
				</div>
			</dialog>
		</RemoveScroll>,
		document.body,
	);
}

/* ------------------------------------------------------------- раскладки --- */

type LayoutProps = {
	banner: BannerView;
	titleId: string;
	bodyId: string;
	onCta: (action: BannerActionView) => void;
	onLink: (action: BannerActionView) => void;
};

/**
 * «Пост»: картинка блоком над текстом, текст под ней и никогда поверх.
 *
 * Пропорция 16:9 задана контейнером, а картинка внутри — `object-cover`.
 * Полагаться на собственный размер картинки нельзя: редактор загрузит и
 * панораму 4000×600, и квадрат, и модалка в первом случае превратится в
 * полоску, а во втором займёт весь экран. Кадрирование предсказуемо, а
 * фокусная точка у коллекции `media` включена — значит, кадрируется по тому
 * месту, которое редактор счёл главным.
 */
function PostLayout({ banner, titleId, bodyId, onCta, onLink }: LayoutProps) {
	return (
		<>
			{banner.image && (
				// Пропорция 16:9 — но не в ущерб тексту. На низком экране (телефон в
				// альбомной ориентации) картинка по этой пропорции забирает две трети
				// окна, и заголовок с кнопкой уезжают под прокрутку — то есть баннер
				// показывает картинку и прячет то, ради чего показан. Потолок в 32dvh
				// оставляет содержимому большую часть высоты на любом экране.
				<div
					className="relative w-full shrink-0 overflow-hidden bg-[var(--surface-secondary)]"
					style={{ aspectRatio: "16 / 9", maxHeight: "32dvh" }}
				>
					<Image
						src={banner.image.url}
						alt={banner.image.alt}
						fill
						// Модалка не шире 28rem (max-w-md), поэтому и картинка не шире:
						// без подсказки Next запросил бы кадр под ширину экрана.
						sizes="(max-width: 30rem) 100vw, 28rem"
						// `priority`: картинка находится в модальном окне, которое уже
						// открыто. Ленивая загрузка отложила бы её до попадания в
						// видимую область, где она и так уже находится.
						priority
						className="object-cover"
					/>
				</div>
			)}

			{/*
			 * Прокручивается текст, кнопка — нет.
			 *
			 * Кнопка внутри прокручиваемой области уезжает под нижний край, как
			 * только текста становится больше, чем помещается, — то есть ровно
			 * тогда, когда баннеру есть что сказать. Действие обязано быть на виду
			 * всегда: оно и есть причина, по которой окно открыли.
			 */}
			<div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-6 pt-6 pr-14 pb-2">
				<Title id={titleId}>{banner.title}</Title>
				{banner.body && <Body id={bodyId}>{banner.body}</Body>}
			</div>

			{(banner.cta || banner.link) && (
				<div className="shrink-0 px-6 pt-3 pb-6">
					<Actions banner={banner} onCta={onCta} onLink={onLink} />
				</div>
			)}
		</>
	);
}

/**
 * «Фон»: картинка на всю модалку, текст поверх неё.
 *
 * Два решения, без которых режим не работает:
 *
 *  * ГРАДИЕНТ СНИЗУ. Белый текст на произвольной фотографии нечитаем в половине
 *    случаев, и «выберите картинку потемнее» — не инструкция, а надежда.
 *    Плотная тень от нижнего края к середине даёт предсказуемый контраст на
 *    любом снимке, включая снежный.
 *  * ФИКСИРОВАННЫЕ ЦВЕТА ВМЕСТО ТОКЕНОВ. Текст лежит на фотографии, а не на
 *    поверхности темы, поэтому он белый независимо от темы. `--text-primary`
 *    здесь означал бы цвет, подобранный под `--surface`, которого под текстом
 *    нет.
 */
function BackgroundLayout({
	banner,
	titleId,
	bodyId,
	onCta,
	onLink,
}: LayoutProps) {
	return (
		// Нижняя граница высоты — но не выше потолка окна. `min-height` побеждает
		// `max-height` в CSS, поэтому фиксированные 22rem на низком экране
		// вытолкнули бы модалку за пределы видимой области, и кнопка оказалась бы
		// под краем.
		<div
			className="relative flex flex-col justify-end"
			style={{ minHeight: "min(22rem, 60dvh)" }}
		>
			{banner.image && (
				<>
					<Image
						src={banner.image.url}
						alt={banner.image.alt}
						fill
						sizes="(max-width: 30rem) 100vw, 28rem"
						priority
						className="object-cover"
					/>
					<div
						aria-hidden
						className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/55 to-black/10"
					/>
				</>
			)}

			<div className="relative flex min-h-0 flex-col gap-3 overflow-y-auto px-6 pt-16 pb-1">
				<Title id={titleId} className="text-white">
					{banner.title}
				</Title>
				{banner.body && (
					<Body id={bodyId} className="text-white/85">
						{banner.body}
					</Body>
				)}
			</div>

			{/* Как и в режиме «пост»: текст прокручивается, действие остаётся. */}
			{(banner.cta || banner.link) && (
				<div className="relative shrink-0 px-6 pt-3 pb-6">
					<Actions banner={banner} onCta={onCta} onLink={onLink} onDark />
				</div>
			)}
		</div>
	);
}

/* ---------------------------------------------------------------- части --- */

function Title({
	id,
	className,
	children,
}: {
	id: string;
	className?: string;
	children: string;
}) {
	return (
		// `text-balance` — против висячего слова на второй строке; `break-words` —
		// против одного длинного слова (артикул, название узла), которое иначе
		// растянуло бы модалку за край экрана.
		<h2
			id={id}
			className={cn(
				"text-balance text-lg leading-snug font-semibold break-words",
				className,
			)}
		>
			{children}
		</h2>
	);
}

function Body({
	id,
	className,
	children,
}: {
	id: string;
	className?: string;
	children: string;
}) {
	return (
		// `whitespace-pre-line`: редактор набирает текст в `textarea` и делит его
		// на абзацы переводами строки. Без этого правила два абзаца склеиваются в
		// один — и редактор, увидев результат, начинает вставлять пробелы,
		// которые ничего не исправляют.
		<p
			id={id}
			className={cn(
				"text-sm leading-relaxed break-words whitespace-pre-line",
				className ?? "text-[var(--text-secondary)]",
			)}
		>
			{children}
		</p>
	);
}

/**
 * Кнопка и ссылка.
 *
 * Оба — `<a href>`, а не `<button onClick>`: у ссылки должен быть адрес.
 * Средняя кнопка мыши, «открыть в новой вкладке» из контекстного меню и
 * предпросмотр адреса в строке состояния работают только у настоящей ссылки, и
 * отнимать это у пользователя ради удобства обработчика незачем. Переход при
 * этом перехватывается (`preventDefault`), потому что перед ним надо записать
 * событие; открытие в новой вкладке проходит мимо обработчика и остаётся
 * рабочим.
 */
function Actions({
	banner,
	onCta,
	onLink,
	onDark = false,
}: {
	banner: BannerView;
	onCta: (action: BannerActionView) => void;
	onLink: (action: BannerActionView) => void;
	onDark?: boolean;
}) {
	const { cta, link } = banner;
	if (!cta && !link) return null;

	return (
		<div className="flex flex-col gap-2">
			{cta && (
				<a
					href={cta.href}
					target={cta.kind === "external" ? "_blank" : undefined}
					rel={cta.kind === "external" ? "noopener noreferrer" : undefined}
					onClick={(event) => {
						// Модификаторы и средняя кнопка — это «открыть отдельно».
						// Перехватывать их значит ломать привычное поведение ссылки.
						if (event.metaKey || event.ctrlKey || event.shiftKey) return;
						event.preventDefault();
						onCta(cta);
					}}
					className={buttonStyles(
						"primary",
						"md",
						true,
						cn(
							// Цвет ПОДПИСИ помечен `!`, и без этого он не работает вовсе.
							//
							// Once UI (`@once-ui-system/core/css/styles.css`, подключён в
							// корневом layout'е) объявляет глобальное правило
							// `a:not(.button) { color: … }`. Его вес — 0,1,1, то есть выше
							// любой одноклассовой утилиты Tailwind, и на ЛЮБОЙ ссылке оно
							// перебивает `text-*`. Кнопка баннера — это ссылка (см. ниже,
							// почему `<a>`, а не `<button>`), поэтому под правило попадает
							// и она: подпись молча получала цвет Once UI вместо заданного.
							// На оранжевой кнопке это почти не заметно (цвет Once UI близок
							// к белому), а на белой — это белым по белому.
							//
							// Лечится либо `!`, либо классом `.button`, которым Once UI
							// сама себя исключает. Второе — опора на чужую внутреннюю
							// договорённость, да ещё и с риском подтянуть её собственные
							// стили кнопки; `!` держит решение на нашей стороне.
							//
							// `color:` перед `var(...)` — по другой причине: голое
							// `text-[var(--…)]` двусмысленно (цвет или размер шрифта), и
							// разбирают эту двусмысленность независимо Tailwind (какое
							// свойство выпустить) и tailwind-merge (вытесняет ли класс
							// `text-white` из базовых стилей кнопки).
							onDark
								? "bg-white text-[color:var(--text-dark)]! hover:bg-white/85 focus:ring-white"
								: "text-white!",
						),
					)}
				>
					{cta.label}
				</a>
			)}

			{link && (
				<a
					href={link.href}
					target={link.kind === "external" ? "_blank" : undefined}
					rel={link.kind === "external" ? "noopener noreferrer" : undefined}
					onClick={(event) => {
						if (event.metaKey || event.ctrlKey || event.shiftKey) return;
						event.preventDefault();
						onLink(link);
					}}
					// Кольцо фокуса задано явно: у голого `<a>` его нет, а системная
					// обводка браузера на фотографии не видна — то есть человек,
					// идущий по табу, теряет курсор ровно в фоновом режиме, где он и
					// так хуже всего ориентируется.
					className={cn(
						"self-center rounded-[var(--radius-sm)] px-2 py-1 text-sm underline underline-offset-4",
						"focus:outline-none focus-visible:ring-2",
						// `!` — по той же причине, что и у кнопки выше: глобальное
						// `a:not(.button)` из Once UI перебивает утилиты цвета на любой
						// ссылке. Наведение помечено тоже: важность бьёт вес, и
						// `!important` на базовом цвете отменил бы обычный `hover:`.
						onDark
							? "text-white/80! hover:text-white! focus-visible:ring-white"
							: "text-[color:var(--text-muted)]! hover:text-[color:var(--text-primary)]! focus-visible:ring-[var(--primary)]",
					)}
				>
					{link.label}
				</a>
			)}
		</div>
	);
}
