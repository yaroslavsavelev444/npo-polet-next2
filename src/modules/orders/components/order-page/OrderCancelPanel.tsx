"use client";

import { useRouter } from "next/navigation";
import { CancelOrderSection } from "../CancelOrderSection";

interface Props {
	orderId: string;
	orderNumber: string;
	canCancel: boolean;
}

/**
 * Отмена заказа на его собственной странице.
 *
 * Сама форма отмены — общая с «Моими заказами» (CancelOrderSection): правила,
 * обязательная причина и порог в пять символов не имеют права разойтись между
 * двумя местами, откуда заказ можно отменить.
 *
 * Разница только в том, что делать после успеха. В списке заказов состояние
 * живёт в памяти вкладки, и строка правится на месте. Здесь страница
 * серверная, и единственный честный способ показать новый статус — попросить
 * сервер отрисовать её заново: тогда изменятся разом и заголовок, и знак
 * состояния, и путь заказа, и право на отмену. Правка чего-то одного руками
 * означала бы страницу, где заголовок говорит «оформлен», а путь — «отменён».
 */
export function OrderCancelPanel({ orderId, orderNumber, canCancel }: Props) {
	const router = useRouter();

	return (
		<CancelOrderSection
			orderId={orderId}
			orderNumber={orderNumber}
			canCancel={canCancel}
			onCancelled={() => router.refresh()}
		/>
	);
}
