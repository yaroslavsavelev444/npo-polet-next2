"use client";

import { useEffect, useState } from "react";
import { consumeOrderCelebration } from "../../lib/celebrate-order";
import { OrderConfetti } from "./OrderConfetti";

interface Props {
	orderNumber: string;
}

/**
 * Праздник — только тому переходу, который его заслужил.
 *
 * Компонент ничего не рисует до тех пор, пока не убедится, что покупатель
 * пришёл сюда прямо с оформления: отметку оставляет форма заказа и забирает
 * этот эффект (см. lib/celebrate-order). Открытие того же адреса из «Моих
 * заказов», перезагрузка и переход по ссылке конфетти не запускают.
 *
 * Проверка живёт в эффекте, а не в теле компонента: sessionStorage на сервере
 * не существует, и обращение к нему при отрисовке разошлось бы с серверной
 * разметкой. Заодно это гарантирует, что отметка забирается ровно один раз, а
 * не на каждый повторный рендер.
 */
export function OrderCelebration({ orderNumber }: Props) {
	const [celebrate, setCelebrate] = useState(false);

	useEffect(() => {
		if (consumeOrderCelebration(orderNumber)) setCelebrate(true);
	}, [orderNumber]);

	if (!celebrate) return null;

	return <OrderConfetti />;
}
