"use client";

import { useRowLabel } from "@payloadcms/ui";

/**
 * Подпись строки в списке документов главной.
 *
 * Без неё свёрнутые строки подписаны «Документ 01», «Документ 02» — и чтобы
 * найти нужный, приходится раскрывать их по очереди. Здесь в подписи стоит
 * само название плюс пометка, если документ выключен: список создан ради
 * перетаскивания, а перетаскивать вслепую нельзя.
 *
 * Сделано по образцу FaqQuestionRowLabel — второго такого же массива в
 * админке.
 */
export function HomeDocumentRowLabel() {
	const { data, rowNumber } = useRowLabel<{
		title?: string;
		isActive?: boolean;
	}>();

	const index = String((rowNumber ?? 0) + 1).padStart(2, "0");
	const title = data?.title?.trim();

	return (
		<span>
			{index}
			{". "}
			{title || "Новый документ"}
			{data?.isActive === false ? " — скрыт" : ""}
		</span>
	);
}
