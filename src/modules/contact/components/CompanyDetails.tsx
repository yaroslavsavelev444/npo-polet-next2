import type { Setting } from "@/payload-types";
import { Reveal } from "@/shared/components/motion/Reveal";
import { cn } from "@/utils/cn";
import { details as copy } from "../content/contacts-content";
import { parseMapEmbed } from "../lib/map-embed";
import { Container, MonoLabel, Section, SectionHeading } from "./layout";

/**
 * Реквизиты, адреса и карта.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ПОЧЕМУ ОПИСАТЕЛЬНЫЙ СПИСОК, А НЕ КАРТОЧКА
 * ────────────────────────────────────────────────────────────────────────────
 * Здесь ровно один тип содержания — пара «название реквизита → значение».
 * Именно это и есть <dl>: разметка сообщает связь, которую в наборе <div> с
 * иконками приходится изображать отступами. Скринридер читает такой список как
 * «Фактический адрес: …», а не как две несвязанные строки.
 *
 * Строки разделены той же прочерчивающейся линией, что и каналы связи выше:
 * разлиновка — общий структурный приём страницы, и повторять её здесь нужно,
 * чтобы две секции читались как одна система.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * КАРТА
 * ────────────────────────────────────────────────────────────────────────────
 * По умолчанию НЕ показывается: чтобы она появилась, нужны одновременно
 * включённый флаг (details.showMap в content/contacts-content.ts или проп
 * showMap) и заполненное поле «Код карты» в настройках сайта. Флаг разрешает,
 * настройка даёт адрес — без любого из двух секция остаётся текстовой, и это
 * рабочее состояние, а не деградация: адрес на странице есть, его можно
 * скопировать в навигатор.
 *
 * Когда карта включена, она стоит справа и приглушена по яркости (.map-frame):
 * встроенный виджет приходит со своей световой схемой и на тёмной странице
 * светится белым прямоугольником. Полную яркость он получает при наведении —
 * то есть тогда, когда с картой начинают работать.
 *
 * Без карты список реквизитов занимает всю ширину: колонка в половину экрана
 * с пустотой справа читалась бы как незагрузившийся блок.
 */
export function CompanyDetails({
	settings,
	showMap = copy.showMap,
}: {
	settings: Setting;
	/** Разовое переопределение флага из контента. */
	showMap?: boolean;
}) {
	const rows: { label: string; value: string }[] = [
		{ label: copy.labels.company, value: settings.companyName },
		{ label: copy.labels.physicalAddress, value: settings.physicalAddress },
		{ label: copy.labels.legalAddress, value: settings.legalAddress },
		{ label: copy.labels.workingHours, value: settings.workingHours },
	].flatMap((row) =>
		row.value ? [{ label: row.label, value: row.value }] : [],
	);

	// Два условия, а не одно: флаг разрешает показ, настройка даёт адрес.
	const mapSrc = showMap ? parseMapEmbed(settings.map) : null;

	if (rows.length === 0 && !mapSrc) return null;

	return (
		<Section id="details">
			<Container className="py-[clamp(3.5rem,7vw,7rem)]">
				<Reveal>
					<SectionHeading>{copy.heading}</SectionHeading>
				</Reveal>

				{/*
				  Две колонки — только когда карта есть. Без неё список реквизитов
				  занимает всю ширину: колонка в половину экрана с пустотой справа
				  читается как блок, который не загрузился.
				*/}
				<div
					className={cn(
						"mt-[clamp(2rem,4vw,3.5rem)] grid gap-[clamp(2.5rem,5vw,4.5rem)] lg:items-start",
						mapSrc && "lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]",
					)}
				>
					{rows.length > 0 ? (
						<dl className="m-0 flex flex-col">
							{rows.map((row, index) => (
								<Reveal
									key={row.label}
									delay={index * 80}
									className="contact-detail-row relative grid gap-1.5 py-[clamp(0.875rem,1.6vw,1.25rem)] sm:grid-cols-[minmax(9rem,13rem)_minmax(0,1fr)] sm:items-baseline sm:gap-6"
								>
									<dt>
										<MonoLabel>{row.label}</MonoLabel>
									</dt>
									<dd className="m-0 max-w-[52ch] text-[0.9375rem] leading-relaxed text-[var(--text-primary)] sm:text-[1rem]">
										{row.value}
									</dd>
								</Reveal>
							))}
						</dl>
					) : (
						<p className="text-[0.9375rem] text-[var(--text-muted)]">
							{copy.empty}
						</p>
					)}

					{mapSrc ? (
						<Reveal variant="soft" delay={160}>
							<figure className="m-0 flex flex-col gap-3">
								<div className="map-frame reticle overflow-hidden rounded-[var(--radius-md)] border border-[var(--rule)]">
									<iframe
										src={mapSrc}
										title={copy.mapCaption}
										loading="lazy"
										referrerPolicy="no-referrer-when-downgrade"
										className="block h-[clamp(16rem,32vw,24rem)] w-full border-0"
									/>
								</div>
								<figcaption>
									<MonoLabel>{copy.mapCaption}</MonoLabel>
								</figcaption>
							</figure>
						</Reveal>
					) : null}
				</div>
			</Container>
		</Section>
	);
}
