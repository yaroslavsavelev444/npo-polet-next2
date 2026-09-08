import { Reveal } from "@/shared/components/motion/Reveal";
import { type TimelineEntry, timeline } from "../content/home-content";
import { Container, Section, Value } from "./primitives";

/**
 * Хронология.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ПОЧЕМУ НЕ ГОРИЗОНТАЛЬНАЯ ЛЕНТА
 * ────────────────────────────────────────────────────────────────────────────
 * Первая версия везла вехи по горизонтали за вертикальную прокрутку. Приём
 * рассчитан на короткие подписи: веха должна умещаться в узкую колонку и
 * читаться за секунду.
 *
 * Реальное наполнение оказалось другим — тринадцать событий, и половина с
 * абзацем на три-четыре строки (договор с КБ, реорганизация компании,
 * эксперимент с РЛС). В горизонтальной ленте это давало карточки высотой в
 * экран, которые всё равно не помещались, и около трёх тысяч пикселей
 * прокрутки на одну секцию. Приём начал мешать содержанию, поэтому убран:
 * вертикаль не ограничивает ни длину текста, ни число событий.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ГОД — ОДИН РАЗ НА ГРУППУ
 * ────────────────────────────────────────────────────────────────────────────
 * В 2023 году событий пять, в 2025 — четыре. Год у каждой записи, набранный
 * акцидентной гарнитурой в 4 rem, превратил бы раздел в колонку из
 * одинаковых «2023». Записи группируются по годам, год печатается один раз и
 * работает заголовком группы, а на широком экране ещё и «прилипает» — пока
 * читаешь события, видно, к какому году они относятся.
 */

interface YearGroup {
	year: string;
	/** Пометка временных данных берётся у первой записи года. */
	placeholder: boolean;
	note?: string;
	entries: TimelineEntry[];
}

/**
 * Группировка идёт по ПОРЯДКУ следования, а не через словарь: записи уже
 * отсортированы хронологически, и годы не должны переставляться местами.
 * Словарь (Map по году) молча склеил бы разнесённые по списку одинаковые годы
 * в одну группу и сломал бы хронологию.
 */
function groupByYear(entries: readonly TimelineEntry[]): YearGroup[] {
	const groups: YearGroup[] = [];

	for (const entry of entries) {
		const year = entry.year.value;
		const last = groups[groups.length - 1];

		if (last && last.year === year) {
			last.entries.push(entry);
			continue;
		}

		groups.push({
			year,
			placeholder: Boolean(entry.year.placeholder),
			note: entry.year.note,
			entries: [entry],
		});
	}

	return groups;
}

export function TimelineSection() {
	const groups = groupByYear(timeline.entries);

	return (
		<Section id="history" tone="void" className="py-[clamp(4.5rem,9vw,9rem)]">
			<Container>
				<Reveal>
					<div className="mb-[clamp(2.5rem,5vw,4.5rem)] flex flex-col gap-4">
						<h2 className="text-[clamp(1.75rem,1.1rem+2.6vw,3.25rem)] font-bold tracking-[-0.025em] text-[var(--text-primary)]">
							{timeline.title}
						</h2>
						<p className="max-w-[54ch] text-[clamp(0.9375rem,0.88rem+0.25vw,1.0625rem)] leading-relaxed text-[var(--text-secondary)]">
							{timeline.intro}
						</p>
					</div>
				</Reveal>

				<div className="flex flex-col">
					{groups.map((group, groupIndex) => (
						<div
							key={`${group.year}-${groupIndex}`}
							// Колонка года — 18rem, а не 14rem. Ширина продиктована
							// гарнитурой: у PaluiSP2 цифра занимает ~1.19em, то есть
							// «2024» — это около 4.8em, и при кегле 3.5rem ей нужно
							// 267px. В 14rem (224px) она не помещалась, а лишнее
							// молча срезалось (см. комментарий к кеглю ниже).
							className="grid gap-x-[clamp(1.5rem,4vw,4rem)] border-t border-[var(--rule)] py-[clamp(2rem,4vw,3.5rem)] lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]"
						>
							{/* Год группы. На широком экране держится у верха, пока
							    читаются её события. */}
							<Reveal className="lg:sticky lg:top-[calc(var(--sticky-header-height)+2rem)] lg:self-start">
								<div className="mb-6 flex items-baseline gap-3 lg:mb-0 lg:flex-col lg:items-start lg:gap-2">
									{/*
									  Верхняя граница кегля — 3.5rem, и она не
									  косметическая, а вычисленная: 4 цифры × 1.19em
									  при 56px дают 267px, то есть влезают в колонку
									  18rem (288px) с запасом. Прежние 4rem давали
									  305px и на широких экранах не помещались.

									  Почему переполнение здесь фатально, а не просто
									  некрасиво: год обёрнут в <Reveal>, а у показанного
									  блока остаётся clip-path: inset(0) — он режет
									  ровно по границам блока. Последняя цифра не
									  «вылезала за колонку», её просто не было:
									  «2024» превращалось в «202».

									  Меняя ширину колонки или кегль, проверьте оба
									  предела заново.
									*/}
									<span className="u-display text-[clamp(2.25rem,1.2rem+3vw,3.5rem)] leading-[0.85] text-[var(--primary)]">
										<Value data={group.entries[0].year} />
									</span>
									<span className="u-mono text-[0.625rem] text-[var(--text-muted)]">
										{group.entries.length}{" "}
										{pluralizeEvents(group.entries.length)}
									</span>
								</div>
							</Reveal>

							{/* События года */}
							<ol className="flex list-none flex-col gap-0 p-0">
								{group.entries.map((entry, index) => (
									<Reveal
										as="li"
										key={`${entry.title}-${index}`}
										delay={index * 70}
										className="relative border-b border-[var(--hairline)] py-[clamp(1rem,2vw,1.5rem)] first:pt-0 last:border-b-0 last:pb-0"
									>
										<div className="flex gap-4 sm:gap-5">
											{/* Засечка на оси времени. Не декоративная
											    точка «для красоты»: она отмечает
											    положение события так же, как штрих на
											    шкале, и выравнена по первой строке
											    заголовка. */}
											<span
												aria-hidden="true"
												className="mt-[0.55em] size-2 shrink-0 rounded-full bg-[var(--void)] shadow-[inset_0_0_0_1px_var(--primary)]"
											/>

											<div className="flex flex-col gap-2">
												<h3 className="text-[clamp(1rem,0.94rem+0.3vw,1.1875rem)] font-semibold tracking-[-0.01em] text-[var(--text-primary)]">
													{entry.title}
												</h3>
												{/*
												  Мера строки ограничена 68 знаками:
												  без неё абзац про договор с КБ
												  растягивался бы на всю ширину
												  колонки и терял строку при переходе
												  на следующую.
												*/}
												<p className="max-w-[68ch] text-[0.9375rem] leading-[1.65] text-[var(--text-secondary)]">
													{entry.body}
												</p>
											</div>
										</div>
									</Reveal>
								))}
							</ol>
						</div>
					))}
					{/* Замыкающая линия: без неё последняя группа выглядит
					    оборванной. */}
					<div className="border-t border-[var(--rule)]" aria-hidden="true" />
				</div>
			</Container>
		</Section>
	);
}

/** 1 событие, 2 события, 5 событий. */
function pluralizeEvents(count: number): string {
	const mod100 = count % 100;
	if (mod100 >= 11 && mod100 <= 14) return "событий";
	switch (count % 10) {
		case 1:
			return "событие";
		case 2:
		case 3:
		case 4:
			return "события";
		default:
			return "событий";
	}
}
