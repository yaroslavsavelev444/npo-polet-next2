"use client";

import { usePathname, useSearchParams } from "next/navigation";
import Script from "next/script";
import { Suspense, useEffect } from "react";

declare global {
	interface Window {
		ym?: (counterId: number, action: string, ...args: unknown[]) => void;
	}
}

// Читаем process.env напрямую, а не через src/env.ts: тот на старте валидирует
// и СЕРВЕРНУЮ схему (PAYLOAD_SECRET, DATABASE_URI), которой в браузере нет, и
// бросает "Invalid server environment variables". Next всё равно инлайнит
// NEXT_PUBLIC_*-переменные в клиентский бандл на этапе сборки, но только при
// статичном обращении к process.env.NEXT_PUBLIC_YM_ID — деструктуризация или
// динамический ключ не сработают.
const YM_ID = process.env.NEXT_PUBLIC_YM_ID;

/**
 * Счётчик Яндекс.Метрики.
 *
 * Без NEXT_PUBLIC_YM_ID не рендерится вообще — это штатный режим для dev и
 * превью-стендов (не ошибка конфигурации): иначе они слали бы хиты в боевой
 * счётчик и портили статистику.
 */
export function YandexMetrika() {
	if (!YM_ID) return null;

	return (
		<>
			<Script id="yandex-metrika" strategy="afterInteractive">
				{`
          (function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
          m[i].l=1*new Date();
          for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
          k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})
          (window, document, "script", "https://mc.yandex.ru/metrika/tag.js", "ym");

          ym(${YM_ID}, "init", {
            defer: true,
            clickmap: true,
            trackLinks: true,
            accurateTrackBounce: true,
            webvisor: true,
            ecommerce: "dataLayer"
          });
        `}
			</Script>
			{/*
        useSearchParams внутри требует Suspense-границы: без неё Next при сборке
        роняет любую страницу, которую иначе отрендерил бы статически
        ("useSearchParams should be wrapped in a suspense boundary").
      */}
			<Suspense fallback={null}>
				<MetrikaPageViews />
			</Suspense>
		</>
	);
}

/**
 * Досылает просмотр страницы при клиентской навигации.
 *
 * Метрика сама засчитывает хит только при полной загрузке документа, а App
 * Router почти все переходы делает на клиенте. Без этого хука в статистике
 * оставалась бы только первая страница каждого визита.
 */
function MetrikaPageViews() {
	const pathname = usePathname();
	const searchParams = useSearchParams();

	useEffect(() => {
		if (!YM_ID || typeof window.ym !== "function") return;

		const query = searchParams.toString();
		window.ym(Number(YM_ID), "hit", pathname + (query ? `?${query}` : ""));
	}, [pathname, searchParams]);

	return null;
}
