import { ArrowRight, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { Reveal, RevealLines } from "@/shared/components/motion/Reveal";
import { finalCta } from "../content/home-content";
import { ParallaxFrame } from "./ParallaxFrame";
import { MediaSlot } from "./primitives";

/**
 * Финальный призыв.
 *
 * Возвращает ту же мысль, с которой страница началась («поставить линию
 * защиты» — это и есть перехват вместо поражения), поэтому здесь снова
 * акцидентная гарнитура: два коротких лозунга капслоком в начале и в конце
 * замыкают страницу, а между ними её нет вовсе.
 *
 * Два действия, не одно: посетитель дошёл до конца либо потому, что готов
 * выбирать изделие, либо потому, что его задача не решается серийным. Одна
 * кнопка обслуживала бы половину дошедших.
 */
export function FinalCta() {
	return (
		<section className="relative isolate overflow-hidden bg-[var(--void-deep)]">
			<ParallaxFrame className="absolute inset-0 -z-10" amount="12%">
				<MediaSlot
					imageKey="ctaBackdrop"
					sizes="100vw"
					className="absolute inset-0 h-full w-full"
					imageClassName="opacity-40"
				/>
			</ParallaxFrame>

			{/* Затемнение поверх фона: текст обязан читаться независимо от
			    того, какой кадр туда положат. */}
			<div
				className="absolute inset-0 -z-10 bg-[linear-gradient(to_bottom,var(--void-deep)_0%,rgba(13,16,21,0.82)_45%,var(--void-deep)_100%)]"
				aria-hidden="true"
			/>

			<div className="mx-auto flex w-full max-w-[80rem] flex-col gap-[clamp(2rem,4vw,3.5rem)] px-[1.25rem] py-[clamp(5rem,11vw,10rem)] sm:px-[2rem] lg:px-[3rem]">
				<h2 className="u-display max-w-[16ch] text-[clamp(2rem,1rem+4.4vw,6rem)] text-[var(--text-primary)]">
					<RevealLines lines={[...finalCta.titleLines]} stagger={130} />
				</h2>

				<Reveal delay={220}>
					<p className="max-w-[52ch] text-[clamp(0.9375rem,0.88rem+0.35vw,1.125rem)] leading-relaxed text-[var(--text-secondary)]">
						{finalCta.body}
					</p>
				</Reveal>

				<Reveal delay={320}>
					<div className="flex flex-wrap items-center gap-3">
						<Link
							href={finalCta.primaryCta.href}
							className="group inline-flex items-center gap-2.5 rounded-[var(--radius-sm)] bg-[var(--primary)] px-7 py-4 text-[1rem] font-semibold text-white no-underline transition-colors duration-200 hover:bg-[var(--primary-600)]"
						>
							{finalCta.primaryCta.label}
							<ArrowRight
								className="size-4 transition-transform duration-200 group-hover:translate-x-1"
								aria-hidden="true"
							/>
						</Link>
						<Link
							href={finalCta.secondaryCta.href}
							className="group inline-flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border)] px-7 py-4 text-[1rem] font-medium text-[var(--text-primary)] no-underline transition-colors duration-200 hover:border-[var(--border-light)] hover:bg-[color-mix(in_srgb,var(--surface)_60%,transparent)]"
						>
							{finalCta.secondaryCta.label}
							<ArrowUpRight
								className="size-4 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
								aria-hidden="true"
							/>
						</Link>
					</div>
				</Reveal>
			</div>
		</section>
	);
}
