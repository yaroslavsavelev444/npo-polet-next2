"use client";

import type { CSSProperties } from "react";
import { cn } from "@/utils/cn";
import { useSchemePreference } from "../hooks/useSchemePreference";
import type { SchemePreference } from "../lib/scheme";
import { applySchemePreference } from "../lib/scheme.client";
import styles from "./ColorScheme.module.css";

const OPTIONS: { value: SchemePreference; label: string }[] = [
	{ value: "auto", label: "Авто" },
	{ value: "light", label: "Светлая" },
	{ value: "dark", label: "Тёмная" },
];

/**
 * Полный выбор темы: «Авто» (как в системе), светлая, тёмная.
 *
 * Стоит там, где его ищут спокойно, — в подвале и в мобильном меню. Быстрое
 * переключение живёт в шапке (ThemeToggle), но вернуться к «как в системе»
 * можно только здесь: у кнопки два состояния, у выбора — три.
 *
 * Бегунок едет под выбранный пункт, а не перепрыгивает: так видно, откуда и
 * куда сменился выбор.
 */
export function SchemeSwitch({
	serverPreference,
	fill = false,
	labelledBy,
	className,
}: {
	/** Выбор из cookie — чтобы серверный HTML совпал с гидратацией. */
	serverPreference?: SchemePreference;
	/** Растянуть на ширину контейнера (мобильное меню). */
	fill?: boolean;
	/** id видимого заголовка, если он уже есть рядом, — вместо скрытой подписи. */
	labelledBy?: string;
	className?: string;
}) {
	const preference = useSchemePreference(serverPreference);
	const index = OPTIONS.findIndex((option) => option.value === preference);

	return (
		<fieldset
			className={cn(styles.switch, fill && styles.switchFill, className)}
			style={{ "--index": index } as CSSProperties}
			data-scheme-motion=""
			aria-labelledby={labelledBy}
		>
			{labelledBy ? null : <legend className="sr-only">Тема оформления</legend>}
			<span className={styles.thumb} aria-hidden="true" />
			{OPTIONS.map((option) => (
				<button
					key={option.value}
					type="button"
					className={styles.option}
					aria-pressed={option.value === preference}
					onClick={(event) =>
						applySchemePreference(option.value, event.currentTarget)
					}
				>
					{option.label}
				</button>
			))}
		</fieldset>
	);
}
