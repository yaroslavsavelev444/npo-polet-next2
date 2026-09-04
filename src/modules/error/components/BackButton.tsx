"use client";

import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { buttonStyles } from "@/UI/Button/Button.styles";

/**
 * «Назад» без next/navigation: страница `app/global-not-found.tsx` рендерится
 * Next'ом в обход layout'ов, и полагаться там на контекст роутера нельзя.
 * history.back() работает одинаково в обоих случаях.
 *
 * Кнопка не рендерится, если возвращаться некуда (прямой заход по ссылке из
 * почты, поиска или закладки) — мёртвая кнопка хуже её отсутствия.
 */
export function BackButton({ label = "Назад" }: { label?: string }) {
	const [canGoBack, setCanGoBack] = useState(false);

	useEffect(() => {
		setCanGoBack(window.history.length > 1);
	}, []);

	if (!canGoBack) return null;

	return (
		<button
			type="button"
			onClick={() => window.history.back()}
			className={buttonStyles(
				"outline",
				"md",
				false,
				"active:scale-[0.98] transition-[background-color,border-color,transform] duration-150",
			)}
		>
			<ArrowLeft size={16} aria-hidden />
			{label}
		</button>
	);
}

export default BackButton;
