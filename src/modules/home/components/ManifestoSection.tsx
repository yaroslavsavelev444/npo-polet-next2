import { Reveal, RevealLines } from "@/shared/components/motion/Reveal";
import { manifesto } from "../content/home-content";
import { Container, Section } from "./primitives";

/**
 * Позиционирование: одно утверждение, ради которого стоит читать дальше.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ПОЧЕМУ ЗДЕСЬ НЕ АКЦИДЕНТНЫЙ ШРИФТ
 * ────────────────────────────────────────────────────────────────────────────
 * PaluiSP2 — унициальная и очень широкая гарнитура: три строки связного текста
 * капслоком превращаются в вывеску, которую разбирают по буквам, а не
 * прочитывают фразой. Она отлично работает на коротком лозунге (первый экран,
 * финальный призыв, годы) и мешает там, где нужно именно чтение.
 *
 * Поэтому здесь Manrope в крупном кегле с плотным трекингом. Контраст между
 * секциями держится не сменой гарнитуры, а разницей масштабов: утверждение
 * набрано втрое крупнее пояснения рядом.
 */
export function ManifestoSection() {
	return (
		<Section id="about" tone="void" className="py-[clamp(4.5rem,9vw,9rem)]">
			<Container>
				<div className="grid gap-[clamp(2rem,4vw,4.5rem)] lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
					<h2 className="text-[clamp(1.875rem,1rem+3.6vw,4.25rem)] font-bold leading-[1.04] tracking-[-0.03em] text-[var(--text-primary)]">
						<RevealLines
							lines={[...manifesto.statementLines]}
							stagger={120}
							// Последняя строка — разрешение противопоставления,
							// и она единственная окрашена. Цвет здесь работает
							// как ударение, а не как оформление.
							lineClassName="[&:last-child]:text-[var(--primary)]"
						/>
					</h2>

					<div className="flex flex-col gap-5 lg:pt-[0.75rem]">
						{manifesto.body.map((paragraph, index) => (
							<Reveal key={paragraph.slice(0, 24)} delay={200 + index * 90}>
								<p className="max-w-[54ch] text-[clamp(0.9375rem,0.88rem+0.3vw,1.0625rem)] leading-[1.7] text-[var(--text-secondary)]">
									{paragraph}
								</p>
							</Reveal>
						))}
					</div>
				</div>

				<Reveal delay={320} className="mt-[clamp(3rem,6vw,5.5rem)]">
					{/*
					  Вывод манифеста. Отбит сверху линией со шкалой — тем же
					  элементом, которым размечены границы секций, поэтому он
					  читается как часть системы, а не как вставная цитата.

					  Тире вместо кавычек: это не цитата человека, а
					  собственное утверждение компании, и оформлять его как
					  чужую речь было бы неверно.
					*/}
					<div className="flex flex-col gap-6">
						<div className="rule-ticked" aria-hidden="true" />
						<p className="max-w-[24ch] text-[clamp(1.125rem,0.95rem+0.85vw,1.875rem)] font-semibold leading-[1.28] tracking-[-0.02em] text-[var(--text-primary)]">
							{manifesto.pullquote}
						</p>
					</div>
				</Reveal>
			</Container>
		</Section>
	);
}
