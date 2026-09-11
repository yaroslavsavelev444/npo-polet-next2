import type { ComponentType, ReactNode } from "react";
import styles from "./Orders.module.css";

type IconType = ComponentType<{ size?: number; "aria-hidden"?: boolean }>;

interface OrderFieldProps {
	icon: IconType;
	label: string;
	value: ReactNode;
	/** Делает значение ссылкой (tel:/mailto:/http). */
	href?: string;
	/** Значение, которое диктуют или копируют: трек-номер, ИНН. */
	code?: boolean;
}

/**
 * Строка «значок → подпись → значение» — общий примитив блоков заказа.
 *
 * Подпись набрана мелким капслоком над значением, а не слева от него: слева
 * она отнимала бы у значения половину ширины, а значения здесь длинные —
 * адрес, юридическое наименование, комментарий. Значок стоит на плашке
 * --media-plate, той же, что под кадром товара и монограммой кабинета.
 *
 * <dl> с парами dt/dd — семантика списка определений: это ровно он, и
 * скринридер объявляет его как набор пар.
 */
export function OrderField({
	icon: Icon,
	label,
	value,
	href,
	code,
}: OrderFieldProps) {
	return (
		<div className={styles.field}>
			<span className={styles.fieldIcon} aria-hidden>
				<Icon size={15} />
			</span>
			<div className={styles.fieldBody}>
				<dt className={styles.fieldLabel}>{label}</dt>
				<dd className={`${styles.fieldValue} ${code ? styles.fieldCode : ""}`}>
					{href ? (
						<a href={href} className={styles.fieldLink}>
							{value}
						</a>
					) : (
						value
					)}
				</dd>
			</div>
		</div>
	);
}
