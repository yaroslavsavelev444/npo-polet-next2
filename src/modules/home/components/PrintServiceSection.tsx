"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { ContactForm } from "@/modules/contact/components/ContactForm";
import { Reveal } from "@/shared/components/motion/Reveal";
import { printService as copy } from "../content/home-content";
import styles from "./PrintServiceSection.module.css";
import { Container, Section } from "./primitives";

/**
 * 3D-печать на заказ — полоса после финального призыва.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ПОЧЕМУ ТАК ТИХО
 * ────────────────────────────────────────────────────────────────────────────
 * Это побочная услуга: свободные мощности, а не направление компании. Поэтому
 * блок стоит ПОСЛЕ финального призыва — основной рассказ страницы им не
 * прерывается — и набран как вклейка: фон страницы между двумя тёмными
 * плитами, заголовок обычной гарнитурой, кнопка контурная, а не оранжевая.
 * Единственная деталь с характером — знак: сопло над слоями детали, верхний
 * слой допечатывается один раз, когда блок появляется в кадре.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ФОРМА РАСКРЫВАЕТСЯ НА МЕСТЕ
 * ────────────────────────────────────────────────────────────────────────────
 * Не модальное окно: заявке не нужно ни перехватывать экран, ни запирать
 * фокус — это обычная форма, и посетитель должен видеть, откуда она
 * появилась. Полоса разворачивается вниз от кнопки и сворачивается туда же.
 * Форма — та же, что на странице контактов (ContactForm с topic="print3d"):
 * тот же путь до админки, то же письмо администраторам, но с темой
 * «3D-печать» и необязательным телефоном.
 */
export function PrintServiceSection() {
	const [open, setOpen] = useState(false);
	const regionId = useId();
	const titleId = useId();
	const regionRef = useRef<HTMLDivElement>(null);
	// Фокус в первое поле — только после открытия кнопкой, не на первом рендере.
	const focusOnOpen = useRef(false);

	useEffect(() => {
		if (!open || !focusOnOpen.current) return;
		focusOnOpen.current = false;
		// Кадр спустя: регион уже снял visibility: hidden, иначе фокус в него
		// не встанет.
		const frame = requestAnimationFrame(() => {
			regionRef.current
				?.querySelector<HTMLElement>("input, textarea")
				?.focus({ preventScroll: true });
		});
		return () => cancelAnimationFrame(frame);
	}, [open]);

	return (
		<Section id="print-service">
			{/* Отступы — у контейнера, а не у секции: разлинованная черта Section
			    стоит в потоке первым ребёнком, и отступ секции опустил бы её
			    к самому заголовку. */}
			<Container className={styles.inner}>
				<Reveal variant="soft" className={styles.band}>
					<div className={styles.lead}>
						<span className={styles.glyph} aria-hidden="true">
							<svg viewBox="0 0 32 32" fill="none">
								{/* Сопло */}
								<path
									className={styles.nozzle}
									d="M12 3h8v5l-2.5 3.5h-3L12 8Z"
								/>
								<path className={styles.nozzle} d="M16 11.5v2.5" />
								{/* Слои детали: нижние готовы, верхний допечатывается */}
								<path className={styles.layer} d="M7 27h18" />
								<path className={styles.layer} d="M8 23.5h16" />
								<path className={styles.layerActive} d="M9 20h14" />
							</svg>
						</span>

						<div className={styles.text}>
							<h2 id={titleId} className={styles.title}>
								{copy.title}
							</h2>
							<p className={styles.body}>{copy.body}</p>
						</div>
					</div>

					{/* Статус стоит у кнопки, а не над заголовком: это не подпись
					    раздела, а условие действия — «свободно, можно обсуждать». */}
					<div className={styles.action}>
						<p className={styles.status}>
							<span className={styles.statusDot} aria-hidden="true" />
							{copy.status}
						</p>
						<button
							type="button"
							className={styles.toggle}
							aria-expanded={open}
							aria-controls={regionId}
							onClick={() => {
								focusOnOpen.current = !open;
								setOpen((value) => !value);
							}}
						>
							{open ? copy.close : copy.open}
							<ChevronDown className={styles.toggleIcon} aria-hidden="true" />
						</button>
					</div>
				</Reveal>

				<div
					ref={regionRef}
					id={regionId}
					role="region"
					aria-labelledby={titleId}
					className={styles.region}
					data-open={open ? "true" : "false"}
					// Свёрнутая форма недоступна ни фокусу, ни скринридеру.
					inert={!open}
				>
					<div className={styles.regionClip}>
						<div className={styles.regionInner}>
							<div className={styles.checklist}>
								<p className={styles.checklistTitle}>{copy.checklistTitle}</p>
								<ul className={styles.checklistList}>
									{copy.checklist.map((item) => (
										<li key={item}>{item}</li>
									))}
								</ul>
							</div>

							<div className={styles.form}>
								<ContactForm topic="print3d" />
							</div>
						</div>
					</div>
				</div>
			</Container>
		</Section>
	);
}
