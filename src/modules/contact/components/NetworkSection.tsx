import { ArrowUpRight } from "lucide-react";
import type { Setting } from "@/payload-types";
import { Reveal } from "@/shared/components/motion/Reveal";
import {
	network as copy,
	OTHER_CONTACT_TYPE_LABELS,
	SOCIAL_PLATFORM_LABELS,
} from "../content/contacts-content";
import { bySortOrder } from "../lib/format";
import { otherContactConfig, socialConfig } from "../lib/social-config";
import { Container, MonoLabel, Section, SectionHeading } from "./layout";
import { DrawnRule } from "./primitives";

/**
 * Мессенджеры, соцсети и прочие каналы одним разлинованным списком.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ПОЧЕМУ СПИСОК, А НЕ СЕТКА ПЛИТОК
 * ────────────────────────────────────────────────────────────────────────────
 * Плитки здесь были и оказались хуже по двум причинам сразу. Композиционно:
 * страница целиком построена на горизонтальной разлиновке — каналы связи,
 * реквизиты, разделители секций, — и единственный прямоугольный островок
 * посреди неё читается как вставка из другого макета. Технически: сетка из
 * трёх колонок при пяти элементах оставляет пустую ячейку, и любой способ
 * нарисовать в ней линии сетки подсвечивает эту дыру.
 *
 * Тот же список строками решает обе задачи и вдобавок выравнивает левый край
 * с остальными секциями до пикселя.
 *
 * Соцсети и «другие контакты» — два разных массива в Payload только потому,
 * что у них разный набор полей. Для посетителя это одно и то же: место, где
 * можно написать. Поэтому они идут вперемешку, а разницу показывает подпись
 * слева.
 *
 * Каждый пункт — ссылка целиком, а не строка с кнопкой внутри: цель попадания
 * должна совпадать с тем, что человек видит. Внешние ссылки открываются в
 * новой вкладке, rel="noopener" обязателен — без него открытая страница
 * получает доступ к window.opener.
 */
export function NetworkSection({ settings }: { settings: Setting }) {
	const socials = bySortOrder(settings.socialLinks);
	const others = bySortOrder(settings.otherContacts);

	const items = [
		...socials.map((link) => ({
			key: `social-${link.platform}-${link.url}`,
			label: SOCIAL_PLATFORM_LABELS[link.platform] ?? "Ссылка",
			title: link.title || SOCIAL_PLATFORM_LABELS[link.platform] || "Перейти",
			value: link.url,
			href: link.url,
			description: null as string | null,
			config: socialConfig[link.platform] ?? socialConfig.other,
		})),
		...others.map((contact) => ({
			key: `other-${contact.type}-${contact.value}`,
			label: OTHER_CONTACT_TYPE_LABELS[contact.type] ?? "Канал",
			title: contact.name,
			value: contact.value,
			// Значение может быть и ссылкой, и ником, и номером. Ссылку делаем
			// кликабельной, всё остальное оставляем текстом: «tg: @polet» в href
			// превратился бы в неработающую ссылку.
			href: isHttpUrl(contact.value) ? contact.value : null,
			description: contact.description ?? null,
			config: otherContactConfig[contact.type] ?? otherContactConfig.custom,
		})),
	];

	if (items.length === 0) return null;

	// Разметка строки повторяет строку канала связи из первого экрана — это
	// один и тот же тип содержимого, и выглядеть он обязан одинаково.
	const rowClass =
		"net-link channel-row grid grid-cols-[1fr_auto] items-start gap-x-4 gap-y-1 px-4 py-[clamp(1rem,2vw,1.375rem)] no-underline sm:grid-cols-[minmax(9rem,14rem)_1fr_auto] sm:gap-x-6";

	return (
		<Section id="network" tone="void">
			<Container className="py-[clamp(3.5rem,7vw,7rem)]">
				<Reveal>
					<div className="flex flex-col gap-4">
						<SectionHeading>{copy.heading}</SectionHeading>
						<p className="max-w-[52ch] text-[0.9375rem] leading-relaxed text-[var(--text-secondary)]">
							{copy.intro}
						</p>
					</div>
				</Reveal>

				<DrawnRule className="mt-[clamp(2rem,4vw,3rem)]" />

				<ul className="m-0 flex list-none flex-col p-0">
					{items.map((item, index) => {
						const Icon = item.config.icon;
						const delay = index * 60;

						const body = (
							<>
								<span className="flex items-center gap-3 sm:py-1">
									<Icon
										className="net-link__icon size-[1.125rem] shrink-0"
										aria-hidden="true"
									/>
									<MonoLabel>{item.label}</MonoLabel>
								</span>

								<span className="col-span-2 min-w-0 sm:col-span-1">
									<span className="channel-row__value block text-[1.0625rem] font-medium leading-snug tracking-[-0.015em] text-[var(--text-primary)] sm:text-[1.1875rem]">
										{item.title}
									</span>
									<span className="mt-1 block break-words text-[0.8125rem] leading-snug text-[var(--text-muted)]">
										{item.value}
									</span>
									{item.description ? (
										<span className="mt-2 block max-w-[46ch] text-[0.8125rem] leading-snug text-[var(--text-secondary)]">
											{item.description}
										</span>
									) : null}
								</span>

								<span className="col-start-2 row-start-1 justify-self-end sm:col-start-3 sm:self-center">
									{item.href ? (
										<ArrowUpRight
											className="net-link__arrow size-4 text-[var(--text-muted)]"
											aria-hidden="true"
										/>
									) : null}
								</span>
							</>
						);

						return (
							<li key={item.key}>
								{index > 0 ? <DrawnRule plain delay={delay} /> : null}
								<Reveal delay={delay} className="-mx-4">
									{item.href ? (
										<a
											href={item.href}
											target="_blank"
											rel="noopener noreferrer"
											style={
												{
													"--net-tint": item.config.color,
												} as React.CSSProperties
											}
											className={rowClass}
										>
											{body}
										</a>
									) : (
										<div
											style={
												{
													"--net-tint": item.config.color,
												} as React.CSSProperties
											}
											className={rowClass}
										>
											{body}
										</div>
									)}
								</Reveal>
							</li>
						);
					})}
				</ul>
			</Container>
		</Section>
	);
}

function isHttpUrl(value: string): boolean {
	try {
		const url = new URL(value.trim());
		return url.protocol === "http:" || url.protocol === "https:";
	} catch {
		return false;
	}
}
