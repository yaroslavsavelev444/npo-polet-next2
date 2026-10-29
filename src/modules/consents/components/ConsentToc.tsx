"use client";

import { ChevronDown } from "lucide-react";
import { type MouseEvent, useEffect, useRef, useState } from "react";
import type { ConsentSection } from "../lib/parseConsent";
import styles from "./Consents.module.css";

/**
 * Оглавление документа.
 *
 * Два вида одного списка: на широком экране — колонка слева от текста,
 * которая едет вместе с чтением и отмечает текущий раздел; на узком —
 * раскрывающийся блок над текстом. Оба рендерятся сервером целиком (это
 * обычные ссылки на якоря), JS добавляет только отметку текущего раздела и
 * плавный переход.
 *
 * Текущим считается последний раздел, чей заголовок уже прошёл линию чуть
 * ниже шапки. Не IntersectionObserver по видимости: между двумя короткими
 * разделами на экране бывает три заголовка сразу, и «видимый» ничего не
 * говорит о том, какой из них читают.
 */

/** Линия под шапкой, после которой раздел считается начатым. */
const READING_LINE_OFFSET = 120;

function useActiveSection(ids: string[]): string | null {
	const [active, setActive] = useState<string | null>(null);

	useEffect(() => {
		const headings = ids
			.map((id) => document.getElementById(id))
			.filter((node): node is HTMLElement => node !== null);
		if (headings.length === 0) return;

		const header =
			Number.parseFloat(
				getComputedStyle(document.documentElement).getPropertyValue(
					"--sticky-header-height",
				),
			) || 0;

		let frame = 0;
		const measure = () => {
			frame = 0;
			const line = header + READING_LINE_OFFSET;
			let current: string | null = null;
			for (const heading of headings) {
				if (heading.getBoundingClientRect().top <= line) current = heading.id;
				else break;
			}
			setActive(current);
		};
		const schedule = () => {
			if (!frame) frame = requestAnimationFrame(measure);
		};

		measure();
		window.addEventListener("scroll", schedule, { passive: true });
		window.addEventListener("resize", schedule);
		return () => {
			window.removeEventListener("scroll", schedule);
			window.removeEventListener("resize", schedule);
			if (frame) cancelAnimationFrame(frame);
		};
	}, [ids]);

	return active;
}

function TocList({
	sections,
	active,
	onNavigate,
}: {
	sections: ConsentSection[];
	active: string | null;
	onNavigate: (event: MouseEvent<HTMLAnchorElement>, id: string) => void;
}) {
	return (
		<ol className={styles.tocList}>
			{sections.map((section) => (
				<li key={section.id}>
					<a
						href={`#${section.id}`}
						className={styles.tocLink}
						aria-current={active === section.id ? "true" : undefined}
						onClick={(event) => onNavigate(event, section.id)}
					>
						<span className={styles.tocNumber}>{section.number}.</span>
						<span>{section.title}</span>
					</a>
				</li>
			))}
		</ol>
	);
}

export function ConsentToc({ sections }: { sections: ConsentSection[] }) {
	const ids = useRef(sections.map((section) => section.id)).current;
	const active = useActiveSection(ids);
	const mobileRef = useRef<HTMLDetailsElement>(null);

	const onNavigate = (event: MouseEvent<HTMLAnchorElement>, id: string) => {
		const target = document.getElementById(id);
		if (!target) return;
		// Ссылка с модификатором (новая вкладка, копирование адреса) остаётся
		// обычной ссылкой.
		if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
			return;
		}
		event.preventDefault();

		const reduced = window.matchMedia(
			"(prefers-reduced-motion: reduce)",
		).matches;
		mobileRef.current?.removeAttribute("open");
		target.scrollIntoView({ behavior: reduced ? "auto" : "smooth" });
		target.focus({ preventScroll: true });
		history.replaceState(null, "", `#${id}`);
	};

	if (sections.length < 2) return null;

	return (
		<>
			<nav aria-label="Содержание документа" className={styles.tocDesktop}>
				<span className={styles.factLabel}>Содержание</span>
				<TocList sections={sections} active={active} onNavigate={onNavigate} />
			</nav>

			<details ref={mobileRef} className={styles.tocMobile}>
				<summary className={styles.tocSummary}>
					<span className={styles.tocSummaryText}>
						Содержание
						<span className={styles.factLabel}>
							{sections.length} {pluralSections(sections.length)}
						</span>
					</span>
					<ChevronDown size={18} className={styles.tocChevron} aria-hidden />
				</summary>
				<nav aria-label="Содержание документа">
					<TocList
						sections={sections}
						active={active}
						onNavigate={onNavigate}
					/>
				</nav>
			</details>
		</>
	);
}

function pluralSections(count: number): string {
	const mod10 = count % 10;
	const mod100 = count % 100;
	if (mod10 === 1 && mod100 !== 11) return "раздел";
	if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14))
		return "раздела";
	return "разделов";
}
