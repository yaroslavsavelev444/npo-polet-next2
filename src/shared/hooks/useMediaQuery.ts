"use client";

import { useEffect, useState } from "react";

/**
 * Подписка на CSS media query. На сервере и до монтирования возвращает `false`,
 * чтобы избежать hydration mismatch — значение уточняется в эффекте после
 * гидратации.
 */
export function useMediaQuery(query: string): boolean {
	const [matches, setMatches] = useState(false);

	useEffect(() => {
		const mql = window.matchMedia(query);
		setMatches(mql.matches);

		const handler = (event: MediaQueryListEvent) => setMatches(event.matches);
		mql.addEventListener("change", handler);
		return () => mql.removeEventListener("change", handler);
	}, [query]);

	return matches;
}
