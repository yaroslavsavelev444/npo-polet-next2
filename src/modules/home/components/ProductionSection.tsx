import { Reveal, RevealLines } from "@/shared/components/motion/Reveal";
import { production } from "../content/home-content";
import { ParallaxFrame } from "./ParallaxFrame";
import { Container, MediaSlot, Section, Value } from "./primitives";

/**
 * Производство и испытания.
 *
 * Самая «тяжёлая» по картинке секция страницы, и это осознанно: сюда приходит
 * посетитель, которому нужно понять, завод перед ним или посредник. Такое
 * решение принимают глазами, а не по списку преимуществ.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ПОКАЗАТЕЛИ — СТРОКА СПЕЦИФИКАЦИИ, А НЕ ТРИ КАРТОЧКИ
 * ────────────────────────────────────────────────────────────────────────────
 * Три плитки «большая цифра + подпись» — готовая заготовка лендинга, и
 * читаются они как украшение. Здесь это разлинованная строка вида «величина —
 * единица — что измеряли», то есть ровно та форма, в которой цифры о
 * производстве и приводят в документации.
 */
export function ProductionSection() {
	return (
		<Section
			id="production"
			tone="deep"
			className="py-[clamp(4.5rem,9vw,9rem)]"
		>
			<Container>
				<div className="grid gap-[clamp(2rem,4vw,4rem)] lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-start">
					{/*
					  Заголовок набран основной гарнитурой, а не акцидентной:
					  три строки капслоком в очень широком PaluiSP2 заняли бы
					  экран целиком и перестали читаться фразой. Акцидентный
					  шрифт на этой странице закреплён за короткими лозунгами —
					  первый экран, названия направлений, годы, финальный
					  призыв.
					*/}
					<h2 className="text-[clamp(1.875rem,1.05rem+3.2vw,3.75rem)] font-bold leading-[1.06] tracking-[-0.03em] text-[var(--text-primary)]">
						<RevealLines lines={[...production.titleLines]} stagger={110} />
					</h2>

					<div className="flex flex-col gap-5 lg:pt-2">
						{production.body.map((paragraph, index) => (
							<Reveal key={paragraph.slice(0, 24)} delay={160 + index * 90}>
								<p className="max-w-[54ch] text-[clamp(0.9375rem,0.88rem+0.3vw,1.0625rem)] leading-[1.7] text-[var(--text-secondary)]">
									{paragraph}
								</p>
							</Reveal>
						))}
					</div>
				</div>

				{/* Показатели */}
				<Reveal delay={120} className="mt-[clamp(2.5rem,5vw,4rem)]">
					<dl className="grid grid-cols-1 gap-0 border-t border-[var(--rule)] sm:grid-cols-3">
						{production.stats.map((stat) => (
							<div
								key={stat.label}
								className="flex items-baseline gap-3 border-b border-[var(--rule)] py-5 sm:flex-col sm:items-start sm:gap-2 sm:border-b-0 sm:border-r sm:px-6 sm:py-7 sm:first:pl-0 sm:last:border-r-0"
							>
								<dd className="flex items-baseline gap-1.5 text-[var(--text-primary)]">
									<span className="u-mono text-[clamp(1.5rem,1.1rem+1.6vw,2.5rem)] font-semibold tracking-[0.01em]">
										<Value data={stat.value} />
									</span>
									<span className="u-mono text-[0.6875rem] text-[var(--text-muted)]">
										{stat.unit}
									</span>
								</dd>
								<dt className="text-[0.875rem] text-[var(--text-secondary)]">
									{stat.label}
								</dt>
							</div>
						))}
					</dl>
				</Reveal>
			</Container>

			{/*
			  Кадр цеха.

			  Раньше он шёл во всю ширину окна полосой в 34 rem. Для исходника
			  1280×1225 это означало две беды сразу: обрезку до узкой ленты,
			  от которой оставался ряд стеллажей без пола и потолка, и
			  растягивание 1280 пикселей на экран шириной 1920.

			  Теперь кадр живёт внутри колонки (максимум 80 rem = 1280 px) и
			  имеет пропорцию 16:9 — ровно ту, к которой приведён файл. Пиксель
			  в пиксель, без обрезки в вёрстке и без увеличения.
			*/}
			<Container className="mt-[clamp(3rem,6vw,5rem)]">
				<Reveal variant="soft">
					<ParallaxFrame
						className="aspect-[16/9] w-full overflow-hidden rounded-[var(--radius-md)]"
						amount="6%"
					>
						<MediaSlot
							imageKey="productionWide"
							sizes="(max-width: 80rem) 100vw, 1280px"
							className="absolute inset-0 h-full w-full"
						/>
						{/* Лёгкое затемнение по краям: снимок цеха светлее
						    страницы, и без него кадр «выпрыгивает» из тёмной
						    секции белым пятном. */}
						<div
							className="absolute inset-0 bg-[radial-gradient(120%_100%_at_50%_50%,transparent_40%,rgba(13,16,21,0.55)_100%)]"
							aria-hidden="true"
						/>
					</ParallaxFrame>
				</Reveal>
			</Container>

			{/* Лента кадров с производства */}
			<Container className="mt-[clamp(2rem,4vw,3.5rem)]">
				<Reveal>
					{/*
					  Горизонтальная прокрутка с привязкой к кадру. Это
					  настоящий контейнер прокрутки, а не карусель на кнопках:
					  он работает свайпом, колесом с Shift, стрелками с
					  клавиатуры и не требует ни строчки JS.
					*/}
					<ul
						// scroll-pl обязателен вместе с padding: точка привязки
						// (snap-start) выравнивается по НАЧАЛУ области прокрутки, а
						// не по её внутреннему отступу. Без scroll-padding браузер
						// сразу прокручивал ленту ровно на величину padding-left,
						// съедая отступ, и первый кадр вместе с подписью оказывался
						// обрезан левым краем.
						className="-mx-[1.25rem] flex list-none snap-x snap-mandatory gap-3 overflow-x-auto scroll-pl-[1.25rem] px-[1.25rem] pb-4 sm:-mx-[2rem] sm:scroll-pl-[2rem] sm:px-[2rem] lg:-mx-[3rem] lg:scroll-pl-[3rem] lg:px-[3rem]"
						// Полоса прокрутки здесь — служебный элемент, но
						// убирать её нельзя: без неё не видно, что лента
						// продолжается.
						tabIndex={0}
						aria-label="Кадры с производства"
					>
						{production.gallery.map((frame) => (
							<li
								key={frame.media}
								className="reticle w-[64vw] shrink-0 snap-start sm:w-[32vw] lg:w-[19rem]"
							>
								<figure className="m-0 flex flex-col gap-3">
									<MediaSlot
										imageKey={frame.media}
										aspect="aspect-[3/4]"
										sizes="(max-width: 640px) 64vw, (max-width: 1024px) 32vw, 304px"
										className="overflow-hidden rounded-[var(--radius-sm)]"
										imageClassName="transition-transform duration-700 [transition-timing-function:var(--ease-out-quart)] hover:scale-[1.04]"
									/>
									<figcaption className="u-mono text-[0.625rem] text-[var(--text-muted)]">
										{frame.caption}
									</figcaption>
								</figure>
							</li>
						))}
					</ul>
				</Reveal>
			</Container>
		</Section>
	);
}
