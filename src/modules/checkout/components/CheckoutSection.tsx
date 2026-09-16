"use client";

import { AlertCircle, Check } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import styles from "./Checkout.module.css";

export type CheckoutSectionState = "idle" | "done" | "error";

interface Props {
	/** Номер шага. Показывается, пока раздел не заполнен. */
	index: number;
	title: string;
	hint?: ReactNode;
	state?: CheckoutSectionState;
	/** Действие в шапке раздела — например, «Изменить в корзине». */
	action?: ReactNode;
	children: ReactNode;
	/** id раздела — цель для перехода и подпись для скринридера. */
	id?: string;
}

/**
 * Раздел формы оформления заказа.
 *
 * Не карточка, а раздел: номер, заголовок, подпись и волосяная линия сверху —
 * ровно так же отбиты разделы страницы товара, кабинета и раскрытого заказа.
 *
 * Номер — не украшение. Оформление заказа длиннее экрана в три раза, и
 * пронумерованный путь отвечает на вопрос «сколько ещё осталось» до того, как
 * человек начал прокручивать. Когда раздел заполнен без ошибок, номер
 * заменяется галочкой: прежняя форма не давала узнать, что «с этим блоком
 * всё», иначе как нажав «Подтвердить заказ» и не увидев его в списке проблем.
 *
 * Состояние продублировано текстом для скринридера — по цвету кружка о нём
 * нельзя узнать ни на слух, ни при дальтонизме.
 */
export function CheckoutSection({
	index,
	title,
	hint,
	state = "idle",
	action,
	children,
	id,
}: Props) {
	const titleId = id ? `${id}-title` : undefined;

	return (
		<section
			id={id}
			aria-labelledby={titleId}
			className={`${styles.section} ${styles.enter}`}
			data-state={state === "idle" ? undefined : state}
			style={{ "--i": index } as CSSProperties}
		>
			<div className={styles.sectionHead}>
				<span className={styles.sectionIndex}>
					{state === "done" ? (
						<Check size={13} strokeWidth={3} aria-hidden />
					) : state === "error" ? (
						<AlertCircle size={13} aria-hidden />
					) : (
						String(index).padStart(2, "0")
					)}
					<span className="sr-only">
						{state === "done"
							? "Раздел заполнен"
							: state === "error"
								? "В разделе есть незаполненные поля"
								: `Шаг ${index}`}
					</span>
				</span>

				<div className={styles.sectionHeadBody}>
					<h2 id={titleId} className={styles.sectionTitle}>
						{title}
					</h2>
					{hint && <p className={styles.sectionHint}>{hint}</p>}
				</div>

				{action}
			</div>

			<div className={styles.sectionBody}>{children}</div>
		</section>
	);
}
