"use client";

import { AlertTriangle } from "lucide-react";
import { useEffect, useRef } from "react";
import type { CheckoutErrorEntry } from "../lib/checkout-fields";
import { focusCheckoutField } from "../lib/focus-field";

/**
 * Сводка всех незаполненных и некорректных полей формы.
 *
 * Зачем она нужна отдельно от ошибок у полей: страница оформления длинная, и
 * поле с ошибкой может быть за пределами экрана в момент нажатия «Подтвердить
 * заказ». Без сводки пользователь видит только то, что кнопка «не сработала».
 *
 * Список строится из тех же данных, что и ошибки у полей, поэтому не может
 * разойтись с ними и не содержит устаревших записей: исправленная ошибка
 * исчезает из обоих мест одновременно.
 */

interface Props {
	entries: CheckoutErrorEntry[];
	/**
	 * Уводить фокус в заголовок сводки при появлении. Делается только после
	 * попытки отправки: если бы сводка перехватывала фокус при каждом
	 * появлении ошибки, она бы выдёргивала пользователя из поля во время ввода.
	 */
	focusOnAppear?: boolean;
}

export function CheckoutErrorSummary({ entries, focusOnAppear }: Props) {
	const headingRef = useRef<HTMLParagraphElement>(null);
	const hasEntries = entries.length > 0;

	useEffect(() => {
		if (focusOnAppear && hasEntries) headingRef.current?.focus();
	}, [focusOnAppear, hasEntries]);

	if (!hasEntries) return null;

	return (
		<section
			// alert + assertive: сообщение о невозможности оформить заказ должно
			// быть озвучено сразу, а не в порядке очереди.
			role="alert"
			aria-labelledby="checkout-error-summary-title"
			className="rounded-[var(--radius-md)] border border-(--error)/40 bg-(--error)/8 p-4"
		>
			<p
				id="checkout-error-summary-title"
				ref={headingRef}
				tabIndex={-1}
				className="flex items-center gap-2 text-sm font-semibold text-(--error) outline-none"
			>
				<AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
				{entries.length === 1
					? "Одно поле требует внимания"
					: `Полей с ошибками: ${entries.length}`}
			</p>

			<ul className="mt-3 flex flex-col gap-1.5">
				{entries.map((entry) => (
					<li key={entry.path} className="text-sm leading-snug">
						{entry.elementId ? (
							<button
								type="button"
								onClick={() => focusCheckoutField(entry.elementId)}
								className="text-left text-(--text-primary) underline decoration-(--error)/50 decoration-1 underline-offset-4 transition-colors hover:decoration-(--error) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--error) focus-visible:ring-offset-2 focus-visible:ring-offset-(--surface)"
							>
								<span className="font-medium">{entry.label}</span>
								<span className="text-(--text-secondary)">
									{" "}
									— {entry.message}
								</span>
							</button>
						) : (
							<span className="text-(--text-primary)">
								<span className="font-medium">{entry.label}</span>
								<span className="text-(--text-secondary)">
									{" "}
									— {entry.message}
								</span>
							</span>
						)}
					</li>
				))}
			</ul>
		</section>
	);
}
