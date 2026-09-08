import { ArrowRight, ArrowUpRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Reveal, RevealLines } from "@/shared/components/motion/Reveal";
import { hero, metrics } from "../content/home-content";
import { heroVideo, type VideoSource } from "../lib/media";
import { HeroVideo } from "./HeroVideo";
import { Value } from "./primitives";

/**
 * Первый экран.
 *
 * Композиция строится вокруг одного противопоставления в заголовке, поэтому
 * всё остальное на экране намеренно тише: анонс — одной строкой, подзаголовок
 * — в одну колонку шириной в 46 знаков, показатели уведены в нижнюю ленту.
 *
 * Высота — 100svh, а не 100vh: на мобильных vh считается по окну БЕЗ
 * сворачивающейся адресной строки, из-за чего первый экран оказывается выше
 * видимой области и кнопки уезжают под край. svh считает по минимальному
 * состоянию — на него можно опираться.
 *
 * Источник фона: сначала то, что задано в админке (Настройки сайта → Фон
 * первого экрана), потом файлы из манифеста. Так у контент-менеджера остаётся
 * возможность поменять ролик без выкладки кода.
 */

interface HomeHeroProps {
	/** Из Payload: Настройки сайта → Фон первого экрана. */
	settingsVideoUrl?: string | null;
	settingsImageUrl?: string | null;
	settingsPosterUrl?: string | null;
}

export function HomeHero({
	settingsVideoUrl,
	settingsImageUrl,
	settingsPosterUrl,
}: HomeHeroProps) {
	// Видео из админки приходит одним файлом без альтернативных кодеков —
	// тип не угадываем, пусть браузер определяет сам по ответу сервера.
	const settingsSources: VideoSource[] = settingsVideoUrl
		? [{ src: settingsVideoUrl, type: "" }]
		: [];

	const sources = settingsSources.length
		? settingsSources
		: heroVideo.available
			? heroVideo.sources
			: [];

	const mobileSources = settingsSources.length
		? settingsSources
		: heroVideo.available
			? heroVideo.mobileSources
			: [];

	const poster =
		settingsPosterUrl ?? (heroVideo.available ? heroVideo.poster : null);

	const hasVideo = sources.length > 0;
	const hasStillImage = !hasVideo && Boolean(settingsImageUrl);

	return (
		<section
			className="relative isolate flex min-h-[100svh] flex-col justify-end overflow-hidden bg-[var(--void-deep)]"
			style={{
				// Шапка сайта — position: fixed, и её место в потоке держит
				// HeaderSpacer. Первый экран должен заезжать ПОД неё (она
				// полупрозрачная), поэтому спейсер компенсируется отрицательным
				// полем, а содержимое возвращается вниз таким же паддингом.
				marginTop: "calc(-1 * var(--sticky-header-height))",
				paddingTop: "var(--sticky-header-height)",
			}}
		>
			{/* ── Фон ─────────────────────────────────────────────────────── */}
			<div className="absolute inset-0 -z-10" aria-hidden="true">
				{hasVideo ? (
					<HeroVideo
						sources={sources}
						mobileSources={mobileSources}
						poster={poster}
						className="absolute inset-0 h-full w-full object-cover"
					/>
				) : hasStillImage ? (
					<Image
						src={settingsImageUrl as string}
						alt=""
						fill
						priority
						sizes="100vw"
						quality={82}
						className="object-cover"
					/>
				) : (
					// Материалов ещё нет. Вместо пустоты — тёмное поле с
					// горизонтом: это буквально предметная область (небо над
					// объектом), а не абстрактная декорация, и первый экран
					// остаётся композиционно целым до появления ролика.
					<div className="absolute inset-0">
						<div
							className="absolute inset-0"
							style={{
								background:
									"radial-gradient(120% 80% at 50% 108%, color-mix(in srgb, var(--primary) 22%, transparent) 0%, transparent 62%), linear-gradient(to bottom, var(--void-deep) 0%, #171b23 55%, var(--void-deep) 100%)",
							}}
						/>
						<div className="absolute inset-x-0 bottom-[32%] h-px bg-[linear-gradient(to_right,transparent,var(--rule)_18%,var(--rule)_82%,transparent)]" />
					</div>
				)}

				{/* Затемнение: сильнее сверху и снизу, где лежат шапка и текст.
				    Середина остаётся открытой, иначе ролик не виден вовсе. */}
				<div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(13,16,21,0.82)_0%,rgba(13,16,21,0.28)_38%,rgba(13,16,21,0.55)_72%,rgba(13,16,21,0.96)_100%)]" />
			</div>

			{/* ── Содержание ──────────────────────────────────────────────── */}
			<div className="mx-auto flex w-full max-w-[110rem] flex-1 flex-col justify-end px-[1.25rem] pb-[2rem] pt-[6rem] sm:px-[2rem] lg:px-[3rem] lg:pb-[2.5rem]">
				{hero.announcement ? (
					<Reveal delay={80} className="mb-[2rem] lg:mb-[2.5rem]">
						<Link
							href={hero.announcement.href}
							className="group inline-flex max-w-full items-center gap-2.5 rounded-full border border-[var(--border)] bg-[color-mix(in_srgb,var(--void-deep)_72%,transparent)] py-1.5 pl-2 pr-3.5 text-sm text-[var(--text-secondary)] no-underline backdrop-blur-md transition-colors duration-200 hover:border-[var(--border-light)] hover:text-[var(--text-primary)]"
						>
							<span className="u-mono rounded-full bg-[var(--primary)] px-2 py-0.5 text-[0.625rem] font-semibold text-white">
								{hero.announcement.label}
							</span>
							<span className="truncate">{hero.announcement.text}</span>
							<ArrowRight
								className="size-3.5 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5"
								aria-hidden="true"
							/>
						</Link>
					</Reveal>
				) : null}

				{/*
				  Заголовок занимает ВСЮ ширину, а пояснение и кнопки стоят под
				  ним, а не рядом.

				  Это продиктовано самой гарнитурой: PaluiSP2 очень широкая —
				  средняя ширина знака около 1.2em против ~0.5em у Manrope.
				  Строка «А НЕ ПОРАЖЕНИЕ» в колонке шириной в половину экрана
				  ломается на две даже при умеренном кегле, и противопоставление,
				  на котором держится фраза, разваливается. Полная ширина
				  позволяет держать крупный кегль и заданную разбивку строк
				  одновременно.

				  Обе границы кегля подобраны замером, а не на глаз, и обе
				  привязаны к конкретной строке заголовка:

				  — верхняя (5.75rem) — предел, при котором самая длинная строка
				    ещё умещается в контейнер на широком мониторе;
				  — нижняя (2rem) — предел, при котором на экране 375 px в одну
				    строку помещается слово «ПОРАЖЕНИЕ» (324 px при доступных
				    338). Крупнее — и оно рвётся переносом «ПО-РАЖЕНИЕ»,
				    мельче — заголовок перестаёт быть заголовком.

				  Меняя текст заголовка в content/home-content.ts, оба предела
				  нужно проверить заново: у этой гарнитуры знак почти вдвое шире
				  обычного, и запаса здесь нет.
				*/}
				<h1 className="u-display text-[clamp(2rem,0.6rem+3.7vw,5.75rem)] text-[var(--text-primary)]">
					<RevealLines lines={[...hero.headlineLines]} stagger={130} />
				</h1>

				<div className="mt-[clamp(1.75rem,3vw,2.75rem)] grid gap-[1.75rem] lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:gap-[3rem]">
					<div className="flex flex-col gap-[1.75rem]">
						<Reveal delay={340}>
							<p className="max-w-[52ch] text-[clamp(0.9375rem,0.86rem+0.35vw,1.125rem)] leading-relaxed text-[var(--text-secondary)]">
								{hero.subheading}
							</p>
						</Reveal>

						<Reveal delay={440}>
							<div className="flex flex-wrap items-center gap-3">
								<Link
									href={hero.primaryCta.href}
									className="group inline-flex items-center gap-2.5 rounded-[var(--radius-sm)] bg-[var(--primary)] px-6 py-3.5 text-[0.9375rem] font-semibold text-white no-underline transition-colors duration-200 hover:bg-[var(--primary-600)]"
								>
									{hero.primaryCta.label}
									<ArrowRight
										className="size-4 transition-transform duration-200 group-hover:translate-x-1"
										aria-hidden="true"
									/>
								</Link>
								<Link
									href={hero.secondaryCta.href}
									className="group inline-flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border)] px-6 py-3.5 text-[0.9375rem] font-medium text-[var(--text-primary)] no-underline transition-colors duration-200 hover:border-[var(--border-light)] hover:bg-[color-mix(in_srgb,var(--surface)_60%,transparent)]"
								>
									{hero.secondaryCta.label}
									<ArrowUpRight
										className="size-4 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
										aria-hidden="true"
									/>
								</Link>
							</div>
						</Reveal>
					</div>

					{/* Маркер прокрутки — во второй колонке, у правого края:
					    подсказка «здесь есть продолжение» не должна тесниться
					    под кнопками, ради которых сделан весь экран.
					    Декоративен: в порядке документа продолжение и так
					    следующее, объявлять его отдельно нечем. */}
					<Reveal delay={620} className="hidden lg:block">
						<div
							className="flex flex-col items-end gap-3 pb-1"
							aria-hidden="true"
						>
							<span className="u-mono text-[0.625rem] text-[var(--text-muted)]">
								{hero.scrollHint}
							</span>
							<span className="scroll-hint relative h-12 w-px overflow-hidden bg-[var(--rule)]" />
						</div>
					</Reveal>
				</div>
			</div>

			{/* ── Лента показателей ───────────────────────────────────────── */}
			<HeroMetrics />
		</section>
	);
}

/**
 * Показатели идут одной непрерывной лентой, а не сеткой «крупная цифра +
 * подпись».
 *
 * Причина не в оригинальности: сетка из четырёх чисел на первом экране
 * читается как декоративный элемент шаблона, её пролистывают не читая. Лента
 * ведёт себя как приборная строка — она движется, её можно остановить
 * наведением, и в ней сразу видно, что показателей больше, чем помещается.
 *
 * Дублирование списка — не опечатка: два одинаковых набора и сдвиг ровно на
 * половину дают бесшовную петлю без единого измерения в JS.
 */
function HeroMetrics() {
	const items = [...metrics, ...metrics];

	return (
		<div className="marquee relative border-t border-[var(--rule)] bg-[color-mix(in_srgb,var(--void-deep)_78%,transparent)] py-3.5 backdrop-blur-md">
			{/* Края ленты гаснут — иначе строка выглядит обрезанной по краю
			    окна, а не уходящей за него. */}
			<div
				className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-[linear-gradient(to_right,var(--void-deep),transparent)]"
				aria-hidden="true"
			/>
			<div
				className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-[linear-gradient(to_left,var(--void-deep),transparent)]"
				aria-hidden="true"
			/>

			<ul className="marquee-track list-none gap-0 p-0">
				{items.map((metric, index) => (
					<li
						key={`${metric.label}-${index}`}
						className="flex shrink-0 items-baseline gap-2.5 whitespace-nowrap px-[1.75rem]"
						// Вторая половина ленты — визуальный дубль первой.
						// Скринридер и поиск должны прочитать список один раз.
						aria-hidden={index >= metrics.length ? "true" : undefined}
					>
						<span className="u-mono text-[0.9375rem] font-semibold tracking-[0.02em] text-[var(--text-primary)]">
							<Value data={metric.value} />
						</span>
						<span className="text-[0.8125rem] text-[var(--text-muted)]">
							{metric.label}
						</span>
						<span
							className="ml-[1.75rem] h-3 w-px bg-[var(--rule)]"
							aria-hidden="true"
						/>
					</li>
				))}
			</ul>
		</div>
	);
}
