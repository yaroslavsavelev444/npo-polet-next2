import { Reveal, RevealLines } from "@/shared/components/motion/Reveal";
import { form as copy } from "../content/contacts-content";
import { ContactForm } from "./ContactForm";
import { Container, MonoLabel, Section } from "./layout";

/**
 * Секция с формой.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * КОМПОЗИЦИЯ
 * ────────────────────────────────────────────────────────────────────────────
 * Разворот: слева — зачем писать, справа — куда писать. Обещание и действие
 * стоят на одном экране, но в разных колонках, и между ними проходит
 * вертикальная линия — та же волосяная, которой разлинована вся страница.
 *
 * Пояснение под заголовком отступает от левого края внутрь колонки. Это не
 * декоративный отступ: он ставит абзац в подчинённое положение к заголовку и
 * задаёт направление чтения слева-сверху вниз-вправо — прямо к первому полю.
 *
 * На узких экранах колонки складываются в одну, линия убирается (вертикальный
 * разделитель между блоками, стоящими друг под другом, читается как ошибка), а
 * форма идёт сразу за текстом.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ЗАПАСНОЙ ВЫХОД
 * ────────────────────────────────────────────────────────────────────────────
 * Внизу левой колонки — обычный адрес почты, выровненный по нижнему краю
 * формы. Часть людей форму не заполняет принципиально: непонятно, куда уходит
 * письмо и придёт ли ответ. Держать для них единственный путь через форму
 * значит терять их молча. Заодно этот блок занимает низ колонки, который иначе
 * остаётся пустым на всю высоту формы.
 */
export function ContactFormSection({
	/** Основной адрес из настроек. Нет адреса — нет и блока. */
	fallbackEmail,
}: {
	fallbackEmail?: string | null;
}) {
	return (
		<Section id="form" tone="void">
			<Container className="py-[clamp(4rem,8vw,8rem)]">
				<div className="grid gap-[clamp(2.5rem,5vw,5rem)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-[clamp(3rem,6vw,7rem)]">
					{/* ── Левая колонка ─────────────────────────────────── */}
					<div className="flex flex-col">
						{/*
						  Кегль ниже, чем у заголовка страницы, и не из
						  соображений иерархии: здесь заголовок стоит в колонке
						  шириной в половину разворота, а «ОПИШИТЕ» у PaluiSP2
						  занимает около 9.6em. При прежних 4.5rem слово не
						  помещалось и разрывалось переносом «ОПИШИ-ТЕ».
						  Верхняя граница подобрана так, чтобы оно умещалось в
						  колонку на всех ширинах, где колонки стоят рядом.
						*/}
						<h2 className="u-display text-[clamp(1.75rem,0.5rem+2.6vw,3.25rem)] text-[var(--text-primary)]">
							<RevealLines lines={[...copy.titleLines]} stagger={120} />
						</h2>

						<Reveal delay={260}>
							<p className="mt-[clamp(1.5rem,3vw,2.5rem)] max-w-[40ch] text-[clamp(0.9375rem,0.88rem+0.3vw,1.0625rem)] leading-[1.7] text-[var(--text-secondary)] contact-lead-indent">
								{copy.body}
							</p>
						</Reveal>

						{fallbackEmail ? (
							<Reveal
								delay={380}
								className="mt-auto pt-[clamp(2.5rem,5vw,4rem)]"
							>
								<div className="flex flex-col gap-2">
									<MonoLabel>{copy.fallback.label}</MonoLabel>
									<a
										href={`mailto:${fallbackEmail}`}
										className="channel-row__value w-fit break-all text-[clamp(1rem,0.9rem+0.5vw,1.375rem)] font-medium tracking-[-0.02em] text-[var(--text-primary)] no-underline transition-colors duration-200 hover:text-[var(--primary)] focus-visible:text-[var(--primary)]"
									>
										{fallbackEmail}
									</a>
								</div>
							</Reveal>
						) : null}
					</div>

					{/* ── Правая колонка ────────────────────────────────── */}
					{/*
					  Линия слева от формы — граница между «почему» и «как»,
					  продолжение той же разлиновки, что разделяет каналы связи.
					  Появляется только там, где колонки стоят рядом.
					*/}
					<div className="lg:border-l lg:border-[var(--rule)] lg:pl-[clamp(3rem,6vw,7rem)]">
						<ContactForm />
					</div>
				</div>
			</Container>
		</Section>
	);
}
