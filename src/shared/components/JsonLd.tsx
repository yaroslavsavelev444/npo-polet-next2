import { headers } from "next/headers";

/**
 * Единая точка вывода JSON-LD (`<script type="application/ld+json">`).
 *
 * Делает две вещи, которые нельзя забывать на каждом вызове:
 *
 * 1. Экранирует `<` в `<`. JSON.stringify не экранирует `<` и `/`,
 *    поэтому строка `</script>` в данных (напр. в названии/описании товара)
 *    закрыла бы тег и позволила бы внедрить произвольный HTML/скрипт —
 *    stored XSS. Сейчас данные admin-controlled, но это защитный рубеж на
 *    случай, если в схему попадёт пользовательский ввод.
 *
 * 2. Подставляет CSP-nonce из заголовка x-nonce (его ставит proxy.ts). Без
 *    nonce строгий script-src заблокировал бы этот inline-скрипт.
 */
export async function JsonLd({ data }: { data: unknown }) {
	const nonce = (await headers()).get("x-nonce") ?? undefined;
	const json = JSON.stringify(data).replace(/</g, "\\u003c");

	return (
		<script
			type="application/ld+json"
			nonce={nonce}
			// Next/React намеренно вырезают nonce из клиентских пропсов (чтобы он
			// не утёк в клиентский JS), поэтому на сыром <script> возникает
			// hydration-mismatch (server nonce=... vs client nonce=""). Гасим его:
			// SSR-HTML сохраняет nonce, а сам блок ld+json — это данные, он не
			// исполняется и не гидратируется.
			suppressHydrationWarning
			dangerouslySetInnerHTML={{ __html: json }}
		/>
	);
}
