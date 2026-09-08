import { ArrowDown, Clock } from "lucide-react";
import type { Setting } from "@/payload-types";
import { Reveal, RevealLines } from "@/shared/components/motion/Reveal";
import { hero } from "../content/contacts-content";
import { bySortOrder } from "../lib/format";
import { ChannelList } from "./ChannelList";
import { Container, MonoLabel } from "./layout";
import { DrawnRule } from "./primitives";

/**
 * Первый экран страницы контактов.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * КОМПОЗИЦИЯ
 * ────────────────────────────────────────────────────────────────────────────
 * Сначала — обещание («свяжитесь с менеджером»), сразу под ним — сами каналы.
 * Не наоборот: человек, дошедший до страницы контактов, уже принял решение
 * связаться, и заставлять его листать до телефона значит терять тех, кому
 * нужен именно телефон.
 *
 * Телефоны и почта стоят не карточками, а строками одной разлинованной
 * таблицы: у каждой строки ровно одно содержание — адрес, по которому можно
 * связаться. Карточка предполагает разнородный набор сведений внутри, здесь
 * его нет, и рамка только добавила бы прямоугольников на экран.
 *
 * Высота НЕ фиксирована в 100svh. Первый экран главной — витрина, ему нужна
 * вся высота; здесь под сгибом должно оставаться начало формы, иначе
 * страница выглядит как «телефон и всё».
 */
export function ContactHero({ settings }: { settings: Setting }) {
	const phones = bySortOrder(settings.phones);
	const emails = bySortOrder(settings.emails);
	const hasChannels = phones.length > 0 || emails.length > 0;

	return (
		<section
			className="relative isolate overflow-hidden bg-[var(--void-deep)]"
			style={{
				// Шапка сайта — position: fixed, её место в потоке держит
				// HeaderSpacer. Первый экран заезжает ПОД неё (она
				// полупрозрачная с размытием), поэтому спейсер компенсируется
				// отрицательным полем, а содержимое возвращается вниз таким же
				// паддингом.
				marginTop: "calc(-1 * var(--sticky-header-height))",
				paddingTop: "var(--sticky-header-height)",
			}}
		>
			{/* Свет снизу-слева, из-под заголовка. Один источник, очень
			    сдержанный: это тот же приём, что держит первый экран главной,
			    когда видео ещё не загрузилось, — и он связывает две страницы
			    надёжнее, чем любой повторённый элемент. */}
			<div
				className="pointer-events-none absolute inset-0 -z-10"
				aria-hidden="true"
				style={{
					background:
						"radial-gradient(110% 70% at 8% 100%, color-mix(in srgb, var(--primary) 13%, transparent) 0%, transparent 58%)",
				}}
			/>

			<Container className="flex flex-col pb-[clamp(3rem,7vw,6rem)] pt-[clamp(3.5rem,8vw,7rem)]">
				{/*
				  Границы кегля вычислены по замеру гарнитуры, а не подобраны на
				  глаз. У PaluiSP2 знак кириллицы занимает заметно больше em, чем
				  у Manrope: самая длинная строка заголовка, «МЕНЕДЖЕРОМ», —
				  12.80em (замер при letter-spacing -0.005em).

				  — нижняя (1.5rem = 24px) — 12.80 × 24 = 307px при 335,
				    доступных на экране 375px за вычетом полей контейнера.
				    Крупнее — слово рвётся переносом по слогам;
				  — верхняя (5.5rem = 88px) — 12.80 × 88 = 1126px при 1184px
				    ширины контейнера (80rem минус поля).

				  Меняя текст заголовка, оба предела нужно проверить заново:
				  запаса здесь немного. Разбивку строк и её обоснование см. в
				  content/contacts-content.ts.

				  Ограничение по max-w в ch намеренно снято — единица ch
				  считается по ширине нуля и для этой гарнитуры врёт почти вдвое.
				*/}
				<h1 className="u-display text-[clamp(1.5rem,0.35rem+4.2vw,5.5rem)] text-[var(--text-primary)]">
					<RevealLines lines={[...hero.headlineLines]} stagger={130} />
				</h1>

				<div className="mt-[clamp(1.75rem,3.5vw,3rem)] grid gap-[clamp(1.5rem,3vw,3.5rem)] lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
					<Reveal delay={300}>
						<p className="max-w-[54ch] text-[clamp(0.9375rem,0.86rem+0.35vw,1.125rem)] leading-relaxed text-[var(--text-secondary)]">
							{hero.lead}
						</p>
					</Reveal>

					{settings.workingHours ? (
						<Reveal delay={420}>
							{/* Часы работы стоят рядом с обещанием ответа, а не в
							    реквизитах внизу: это условие, при котором обещание
							    выполняется, и читать его нужно здесь. */}
							<div className="flex items-start gap-3 lg:justify-end">
								<Clock
									className="mt-0.5 size-4 shrink-0 text-[var(--text-muted)]"
									aria-hidden="true"
								/>
								<div className="flex flex-col gap-1.5">
									<MonoLabel>Отвечаем</MonoLabel>
									<span className="max-w-[26ch] text-[0.9375rem] leading-snug text-[var(--text-primary)]">
										{settings.workingHours}
									</span>
								</div>
							</div>
						</Reveal>
					) : null}
				</div>

				{hasChannels ? (
					<>
						<div className="mt-[clamp(2.5rem,5vw,4.5rem)] flex items-baseline justify-between gap-4">
							<MonoLabel>{hero.channelsHeading}</MonoLabel>
							{/* Подсказка о продолжении — только на широких экранах:
							    на телефоне следующая секция и так начинается через
							    один жест, и стрелка была бы шумом. */}
							<span
								className="hidden items-center gap-2 lg:inline-flex"
								aria-hidden="true"
							>
								<MonoLabel>{hero.scrollHint}</MonoLabel>
								<ArrowDown className="size-3 text-[var(--text-muted)]" />
							</span>
						</div>

						<DrawnRule className="mt-3" />

						<ChannelList phones={phones} emails={emails} />
					</>
				) : null}
			</Container>
		</section>
	);
}
