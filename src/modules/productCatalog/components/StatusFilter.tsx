"use client";

import { useId } from "react";
import { useProductFilters } from "../hooks/useProductFilters";
import { STATUS_OPTIONS } from "../lib/catalogOptions";
import styles from "./Catalog.module.css";

/**
 * Наличие — единственный фильтр каталога со списком взаимоисключающих
 * значений, поэтому у него два представления под два разных контекста.
 *
 * "segmented" — панель управления на широком экране: четыре варианта
 * помещаются в строку, и вынести их наружу дешевле, чем прятать под кнопку.
 * Один клик вместо «открыть → выбрать → закрыть».
 *
 * "list" — нижний лист на телефоне и поповер на узком десктопе: вертикальный
 * список с целью в 2.75rem. Сегментированный переключатель на 360px пришлось
 * бы либо сжимать до нечитаемого, либо укладывать в две строки — и то и
 * другое хуже списка, который и так читается сверху вниз.
 *
 * ─── Почему нативные radio, а не кнопки с aria-pressed ──────────────────────
 * Варианты взаимоисключающие, и оба представления так и нарисованы: список — с
 * радиометкой, переключатель — с единственным залитым сегментом. Кнопка-тумблер
 * под таким видом обещает то, чего не делает: скринридер объявляет «нажата /
 * не нажата» вместо «выбран 2 из 4», а с клавиатуры каждый вариант приходится
 * обходить табом. Нативная группа radio даёт и правильное объявление, и
 * переход стрелками — бесплатно, без обработчиков клавиш.
 *
 * Имя группы уникально на экземпляр (useId): на широком экране одновременно
 * смонтированы список в поповере и список в нижнем листе, и с общим именем
 * браузер связал бы их в ОДНУ группу — переключение в одной сбрасывало бы
 * отметку в другой.
 */
export function StatusFilter({
	variant = "list",
}: {
	variant?: "segmented" | "list";
}) {
	const { filters, updateFilters } = useProductFilters();
	const groupName = useId();

	if (variant === "segmented") {
		return (
			<fieldset className={styles.segmented}>
				<legend className="sr-only">Наличие</legend>
				{STATUS_OPTIONS.map((option) => (
					<label
						key={option.value}
						className={styles.segment}
						// Выбранный вариант и суженная выдача — разные вещи: «Все
						// товары» это отсутствие фильтрации, и акцент ему не
						// достаётся. См. .segmentBody в Catalog.module.css.
						data-filter={option.value !== "all" || undefined}
					>
						<input
							type="radio"
							name={groupName}
							value={option.value}
							checked={filters.status === option.value}
							onChange={() => updateFilters({ status: option.value })}
							className={styles.controlInput}
						/>
						<span className={styles.segmentBody}>{option.label}</span>
					</label>
				))}
			</fieldset>
		);
	}

	return (
		<fieldset className={styles.group}>
			<legend className={styles.micro}>Наличие</legend>
			<div className={styles.optionList}>
				{STATUS_OPTIONS.map((option) => (
					<label key={option.value} className={styles.option}>
						<input
							type="radio"
							name={groupName}
							value={option.value}
							checked={filters.status === option.value}
							onChange={() => updateFilters({ status: option.value })}
							className={styles.controlInput}
						/>
						<span aria-hidden className={styles.optionDot} />
						<span className={styles.optionLabel}>{option.label}</span>
					</label>
				))}
			</div>
		</fieldset>
	);
}

export default StatusFilter;
